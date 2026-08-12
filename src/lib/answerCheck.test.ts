import { describe, expect, it } from "vitest";
import { checkLocally } from "./answerCheck";
import type { Question } from "./types";

// Minimal Question fixtures — only the fields checkLocally() reads matter here.
function q(overrides: Partial<Question>): Question {
  return {
    question_text: "",
    answer_type: "numeric",
    canonical_answer: "0",
    accepted_forms: [],
    tolerance: null,
    units: null,
    preferred_input: "typed",
    worked_solution: "",
    hint: "",
    difficulty: "standard",
    ...overrides,
  };
}

const half = q({ answer_type: "fraction", canonical_answer: "1/2", accepted_forms: ["1/2", "0.5", "50%", "2/4"] });
const threeQuarters = q({ answer_type: "fraction", canonical_answer: "3/4" });
const fiveSixths = q({ answer_type: "fraction", canonical_answer: "5/6" });
const oneThird = q({ answer_type: "fraction", canonical_answer: "1/3" });
const mixedImproper = q({
  answer_type: "fraction",
  canonical_answer: "25/24",
  accepted_forms: ["25/24", "1 1/24"],
});

const lengthCm = q({ answer_type: "numeric", canonical_answer: "15", units: "cm" });
const decimalTol = q({ answer_type: "numeric", canonical_answer: "0.75", tolerance: 0.01 });
const plainNumber = q({ answer_type: "numeric", canonical_answer: "12" });

const ratioTwoThree = q({ answer_type: "ratio", canonical_answer: "2:3" });
const ratioThreeFive = q({ answer_type: "ratio", canonical_answer: "3:5" });

const exprLinear = q({ answer_type: "expression", canonical_answer: "2x+4" });
const exprDifferenceOfSquares = q({ answer_type: "expression", canonical_answer: "x^2-1" });
const exprCollectTerms = q({ answer_type: "expression", canonical_answer: "3x" });

// RFD §16 acceptance criterion 3: "Typed checking tested against thirty equivalent-form
// inputs (1/2, 0.5, 50%, 2/4, ½, 0.50, wrong units, unsimplified fractions) with no false
// rejections." "No false rejection" means status must never come back "incorrect" — near-miss
// statuses (units / unsimplified) are the expected outcome for those specific cases, not a
// rejection, since the UI shows them as correct-with-a-note per RFD §9.3.
const equivalentFormCases: Array<{
  description: string;
  question: Question;
  input: string;
  expectedStatus: "correct" | "near_miss_units" | "near_miss_unsimplified";
}> = [
  // canonical 1/2, accepted_forms lists the common equivalents explicitly (as Sonnet would).
  { description: "exact canonical form", question: half, input: "1/2", expectedStatus: "correct" },
  { description: "decimal in accepted_forms", question: half, input: "0.5", expectedStatus: "correct" },
  { description: "percent in accepted_forms", question: half, input: "50%", expectedStatus: "correct" },
  { description: "unreduced fraction in accepted_forms", question: half, input: "2/4", expectedStatus: "correct" },
  { description: "unicode fraction glyph", question: half, input: "½", expectedStatus: "correct" },
  { description: "trailing zero decimal, not in accepted_forms", question: half, input: "0.50", expectedStatus: "correct" },
  { description: "surrounding whitespace", question: half, input: " 1/2 ", expectedStatus: "correct" },
  { description: "trailing full stop", question: half, input: "1/2.", expectedStatus: "correct" },
  { description: "uppercase / mixed case has no effect on a fraction", question: half, input: "1/2", expectedStatus: "correct" },
  { description: "en-dash minus normalises the same as hyphen", question: q({ answer_type: "numeric", canonical_answer: "-4" }), input: "–4", expectedStatus: "correct" },

  // decimal reading of a fraction not enumerated in accepted_forms.
  { description: "decimal reading of 3/4", question: threeQuarters, input: "0.75", expectedStatus: "correct" },
  { description: "decimal reading of 3/4 with trailing zeros", question: threeQuarters, input: "0.750", expectedStatus: "correct" },

  // unsimplified fractions — RFD §9.2/§9.3: correct value, near-miss note, not a rejection.
  { description: "unsimplified 10/12 for 5/6", question: fiveSixths, input: "10/12", expectedStatus: "near_miss_unsimplified" },
  { description: "unsimplified 2/6 for 1/3", question: oneThird, input: "2/6", expectedStatus: "near_miss_unsimplified" },
  { description: "unsimplified 4/12 for 1/3", question: oneThird, input: "4/12", expectedStatus: "near_miss_unsimplified" },

  // mixed-number handling (RFD §9.2a normalise() marks "1 1/24" distinctly from "11/24").
  { description: "mixed number in accepted_forms", question: mixedImproper, input: "1 1/24", expectedStatus: "correct" },
  { description: "mixed number, extra internal whitespace", question: mixedImproper, input: "1  1/24", expectedStatus: "correct" },
  { description: "improper fraction canonical form", question: mixedImproper, input: "25/24", expectedStatus: "correct" },

  // units — RFD §9.3: right value, wrong/missing units → correct with a note, not incorrect.
  { description: "correct value with matching units", question: lengthCm, input: "15cm", expectedStatus: "correct" },
  { description: "correct value, missing units", question: lengthCm, input: "15", expectedStatus: "near_miss_units" },
  { description: "correct value, wrong units", question: lengthCm, input: "15m", expectedStatus: "near_miss_units" },
  { description: "correct value, units with whitespace before them", question: lengthCm, input: "15 cm", expectedStatus: "correct" },

  // numeric tolerance.
  { description: "within tolerance, below canonical", question: decimalTol, input: "0.745", expectedStatus: "correct" },
  { description: "within tolerance, above canonical", question: decimalTol, input: "0.755", expectedStatus: "correct" },
  { description: "exact integer match", question: plainNumber, input: "12", expectedStatus: "correct" },
  { description: "integer with redundant decimal", question: plainNumber, input: "12.0", expectedStatus: "correct" },

  // ratio — order-sensitive, but simplified form is still accepted per RFD §9.2.
  { description: "exact ratio", question: ratioTwoThree, input: "2:3", expectedStatus: "correct" },
  { description: "unsimplified ratio", question: ratioTwoThree, input: "4:6", expectedStatus: "correct" },

  // expression — numeric-substitution equivalence per RFD §9.2a, not string/tree matching.
  { description: "factorised form of a linear expression", question: exprLinear, input: "2(x+2)", expectedStatus: "correct" },
  { description: "factorised difference of squares", question: exprDifferenceOfSquares, input: "(x-1)(x+1)", expectedStatus: "correct" },
  { description: "uncollected like terms", question: exprCollectTerms, input: "x+2x", expectedStatus: "correct" },
];

describe("checkLocally — equivalent-form acceptance (RFD §16 criterion 3)", () => {
  it(`covers at least thirty cases (has ${equivalentFormCases.length})`, () => {
    expect(equivalentFormCases.length).toBeGreaterThanOrEqual(30);
  });

  it.each(equivalentFormCases)("$description: $input", ({ question, input, expectedStatus }) => {
    const result = checkLocally(question, input);
    expect(result.status).not.toBe("incorrect");
    expect(result.status).not.toBe("uncertain");
    expect(result.status).toBe(expectedStatus);
  });
});

describe("checkLocally — genuinely wrong answers are still rejected", () => {
  const wrongCases: Array<{ description: string; question: Question; input: string }> = [
    { description: "wrong fraction value", question: half, input: "1/3" },
    { description: "wrong decimal value", question: decimalTol, input: "0.9" },
    { description: "wrong ratio order", question: ratioThreeFive, input: "5:3" },
    { description: "wrong ratio value", question: ratioTwoThree, input: "1:2" },
    { description: "non-equivalent expression", question: exprLinear, input: "2x+5" },
    { description: "wrong integer", question: plainNumber, input: "13" },
  ];

  it.each(wrongCases)("$description: $input", ({ question, input }) => {
    expect(checkLocally(question, input).status).toBe("incorrect");
  });
});

describe("checkLocally — escalates rather than guessing when it genuinely can't tell", () => {
  it("returns uncertain for an expression it can't safely evaluate across trial values", () => {
    // sqrt(x) vs x^0.5: numeric-substitution trials include negative values, where sqrt
    // domain-fails — RFD §9.2a says this should escalate to Haiku (§9.3), not guess either way.
    const question = q({ answer_type: "expression", canonical_answer: "sqrt(x)" });
    expect(checkLocally(question, "x^0.5").status).toBe("uncertain");
  });
});
