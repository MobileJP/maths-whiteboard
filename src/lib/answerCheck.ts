import { create, all } from "mathjs";
import { getAnthropicClient, fastModel } from "./anthropic";
import type { Question } from "./types";

const math = create(all, {});
const KNOWN_MATHJS_NAMES = new Set(Object.keys(math));

const UNICODE_FRACTIONS: Record<string, string> = {
  "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4",
  "⅕": "1/5", "⅖": "2/5", "⅗": "3/5", "⅘": "4/5",
  "⅙": "1/6", "⅚": "5/6", "⅐": "1/7", "⅛": "1/8", "⅜": "3/8",
  "⅝": "5/8", "⅞": "7/8", "⅑": "1/9", "⅒": "1/10",
};

// RFD §9.2: strip whitespace, case-fold, trailing full stops, unicode fractions, minus-sign variants.
function normalise(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/\.$/, "");
  s = s.replace(/[−–]/g, "-"); // − (minus sign) and – (en dash) -> ascii hyphen
  for (const [glyph, expansion] of Object.entries(UNICODE_FRACTIONS)) {
    s = s.split(glyph).join(expansion);
  }
  // Mark mixed numbers ("1 1/24") with an underscore before the final whitespace
  // strip below, so "whole part" + "fraction part" stays distinguishable as
  // "1_1/24" rather than collapsing into the unrelated fraction "11/24".
  s = s.replace(/(-?\d+)\s+(\d+\/\d+)/g, "$1_$2");
  return s.replace(/\s+/g, "");
}

function stripUnits(value: string, units: string | null): { value: string; hadUnits: boolean; unitsMatch: boolean } {
  if (!units) return { value, hadUnits: false, unitsMatch: true };
  const normUnits = normalise(units);
  if (normUnits && value.endsWith(normUnits)) {
    return { value: value.slice(0, -normUnits.length), hadUnits: true, unitsMatch: true };
  }
  const match = value.match(/^([\d./+\-*^()]+)([a-z²³%]+)$/);
  if (match) {
    return { value: match[1], hadUnits: true, unitsMatch: false };
  }
  return { value, hadUnits: false, unitsMatch: true };
}

function compareNumeric(input: string, canonical: string, tolerance: number | null): boolean {
  const a = Number(input);
  const b = Number(canonical);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return Math.abs(a - b) <= (tolerance ?? 1e-9);
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function parseFractionParts(s: string): { n: number; d: number } | null {
  // Mixed number, marked by normalise() as "whole_n/d" (e.g. "1_1/24" for 1 1/24).
  const mixed = s.match(/^(-?\d+)_(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = Number(mixed[1]);
    const fd = Number(mixed[3]);
    if (fd === 0) return null;
    const sign = whole < 0 ? -1 : 1;
    return { n: whole * fd + sign * Number(mixed[2]), d: fd };
  }
  const m = s.match(/^(-?\d+)\/(-?\d+)$/);
  if (!m) return null;
  const d = Number(m[2]);
  if (d === 0) return null;
  return { n: Number(m[1]), d };
}

function normaliseFractionSign(n: number, d: number): [number, number] {
  return d < 0 ? [-n, -d] : [n, d];
}

// RFD §9.2/§9.2a: compare unreduced input against reduced canonical so an
// unsimplified-but-correct fraction (4/8 vs 1/2) is its own case, not a silent pass.
function compareFraction(input: string, canonical: string): { correct: boolean; unreduced: boolean } {
  const inputParts = parseFractionParts(input);
  const canonParts = parseFractionParts(canonical);
  if (!inputParts || !canonParts) {
    // At least one side is a decimal (e.g. "1.0417" for canonical "1 1/24") rather than
    // n/d notation — evaluate whichever side IS a fraction down to a decimal first, so a
    // truncated decimal reading of a fraction still compares correctly, with a wider
    // tolerance than exact-rational comparison since decimal input is inherently truncated.
    const inputVal = inputParts ? inputParts.n / inputParts.d : Number(input);
    const canonVal = canonParts ? canonParts.n / canonParts.d : Number(canonical);
    const correct = !Number.isNaN(inputVal) && !Number.isNaN(canonVal) && Math.abs(inputVal - canonVal) <= 1e-4;
    return { correct, unreduced: false };
  }
  const [inN, inD] = normaliseFractionSign(inputParts.n, inputParts.d);
  const [cnN, cnD] = normaliseFractionSign(canonParts.n, canonParts.d);
  const g = gcd(inN, inD);
  const reducedN = inN / g;
  const reducedD = inD / g;
  const equal = reducedN * cnD === cnN * reducedD;
  return { correct: equal, unreduced: equal && g > 1 };
}

function parseRatio(s: string): number[] | null {
  const parts = s.split(":").map(Number);
  if (parts.length < 2 || parts.some((p) => Number.isNaN(p))) return null;
  return parts;
}

function reduceRatio(parts: number[]): number[] {
  const g = parts.reduce((acc, v) => gcd(acc, v), 0) || 1;
  return parts.map((v) => v / g);
}

function compareRatio(input: string, canonical: string): boolean {
  const a = parseRatio(input);
  const b = parseRatio(canonical);
  if (!a || !b || a.length !== b.length) return false;
  const ra = reduceRatio(a);
  const rb = reduceRatio(b);
  return ra.every((v, i) => v === rb[i]);
}

function extractVariables(node: math.MathNode): string[] {
  const names = new Set<string>();
  node.filter((n) => n.type === "SymbolNode").forEach((n) => {
    const name = (n as unknown as { name: string }).name;
    if (!KNOWN_MATHJS_NAMES.has(name)) names.add(name);
  });
  return [...names];
}

// RFD §9.2a: numeric substitution across several trials, not symbolic simplify() —
// more robust for proving e.g. 2x+4 === 2(x+2) than mathjs's simplify() alone.
// Returns "uncertain" on parse/domain failures so the caller escalates rather than guesses.
function expressionsEquivalent(inputExpr: string, canonicalExpr: string): boolean | "uncertain" {
  let inputNode: math.MathNode;
  let canonNode: math.MathNode;
  try {
    inputNode = math.parse(inputExpr);
    canonNode = math.parse(canonicalExpr);
  } catch {
    return "uncertain";
  }
  const vars = [...new Set([...extractVariables(inputNode), ...extractVariables(canonNode)])];
  const TRIALS = 5;
  for (let t = 0; t < TRIALS; t++) {
    const scope: Record<string, number> = {};
    for (const v of vars) {
      scope[v] = Math.round((Math.random() * 8 - 4 + 0.37) * 100) / 100; // avoid 0 and small integers
    }
    let a: unknown;
    let b: unknown;
    try {
      a = inputNode.evaluate(scope);
      b = canonNode.evaluate(scope);
    } catch {
      return "uncertain"; // e.g. sqrt of a negative for these particular trial values
    }
    if (typeof a !== "number" || typeof b !== "number" || Number.isNaN(a) || Number.isNaN(b)) {
      return "uncertain";
    }
    if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(b))) {
      return false;
    }
  }
  return true;
}

export interface LocalCheckOutcome {
  status: "correct" | "incorrect" | "near_miss_units" | "near_miss_unsimplified" | "uncertain";
  note?: string;
}

// The common case: no model call. See RFD §9 and §8.
export function checkLocally(question: Question, rawAnswer: string): LocalCheckOutcome {
  const normalisedInput = normalise(rawAnswer);
  const normalisedCanonical = normalise(question.canonical_answer);
  const acceptedNormalised = question.accepted_forms.map(normalise);

  if (normalisedInput === normalisedCanonical || acceptedNormalised.includes(normalisedInput)) {
    return { status: "correct" };
  }

  const { value: strippedInput, hadUnits, unitsMatch } = stripUnits(normalisedInput, question.units);
  const strippedCanonical = stripUnits(normalisedCanonical, question.units).value;

  switch (question.answer_type) {
    case "numeric": {
      const tol = question.tolerance ?? 1e-9;
      const correct =
        compareNumeric(strippedInput, strippedCanonical, tol) ||
        acceptedNormalised.some((a) => compareNumeric(strippedInput, stripUnits(a, question.units).value, tol));
      if (!correct) return { status: "incorrect" };
      if (question.units && (!hadUnits || !unitsMatch)) {
        return { status: "near_miss_units", note: "Right value — but check the units." };
      }
      return { status: "correct" };
    }
    case "fraction": {
      const { correct, unreduced } = compareFraction(strippedInput, strippedCanonical);
      if (!correct) return { status: "incorrect" };
      if (unreduced) return { status: "near_miss_unsimplified", note: "Correct value — simplify to lowest terms next time." };
      if (question.units && (!hadUnits || !unitsMatch)) {
        return { status: "near_miss_units", note: "Right value — but check the units." };
      }
      return { status: "correct" };
    }
    case "ratio":
      return compareRatio(strippedInput, strippedCanonical) ? { status: "correct" } : { status: "incorrect" };
    case "expression": {
      const equivalence = expressionsEquivalent(strippedInput, strippedCanonical);
      if (equivalence === "uncertain") return { status: "uncertain" };
      return equivalence ? { status: "correct" } : { status: "incorrect" };
    }
    case "text":
    case "multi":
    default:
      return { status: "incorrect" };
  }
}

// RFD §9.3 / §8: the single deliberate exception to "typed answers need no model call" —
// only reached when local comparison genuinely can't determine equivalence.
export async function adjudicateNearMiss(question: Question, rawAnswer: string): Promise<{ correct: boolean; note: string }> {
  const message = await getAnthropicClient().messages.create({
    model: fastModel(),
    max_tokens: 200,
    system:
      "You are adjudicating a single KS3 maths answer. Decide only whether the student's answer is " +
      "mathematically equivalent to the canonical answer for the stated question. Respond with strict JSON only, " +
      'no code fences: {"correct": boolean, "note": string}. Keep note under 15 words and do not reveal the ' +
      "worked method — only say whether it's equivalent and why in brief.",
    messages: [
      {
        role: "user",
        content:
          `Question: ${question.question_text}\n` +
          `Canonical answer: ${question.canonical_answer}\n` +
          `Accepted forms: ${question.accepted_forms.join(", ")}\n` +
          `Student's answer: ${rawAnswer}`,
      },
    ],
  });
  const text = message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");
  const cleaned = text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as { correct: boolean; note: string };
  return { correct: Boolean(parsed.correct), note: String(parsed.note ?? "") };
}
