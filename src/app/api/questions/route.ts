import { NextRequest, NextResponse } from "next/server";
import { anthropic, capableModel } from "@/lib/anthropic";
import type { Question } from "@/lib/types";

// RFD §12.2 — Sonnet, full answer metadata generated with the question in the same response.
const SYSTEM_PROMPT = `You generate UK Year 7 (KS3) maths practice questions for a single adult relearner.

For EACH question produce, in the same response:
- question_text: the question, as LaTeX (inline maths in $...$, display maths in $$...$$)
- answer_type: one of "numeric" | "fraction" | "expression" | "ratio" | "text"
- canonical_answer: the definitive form of the answer, as a plain string (e.g. "1/2", "3x+2", "12", "2:3").
  For answer_type "fraction", canonical_answer MUST be a single improper fraction in "n/d" form
  (e.g. "25/24", never "1 1/24") — put the mixed-number reading in accepted_forms instead.
- accepted_forms: an array of every reasonable equivalent form a student might type
  (e.g. for 1/2: ["1/2", "0.5", "50%"]; for an improper fraction like 25/24, include the mixed-number
  form too: ["25/24", "1 1/24", "1.041666..."])
- tolerance: a number for decimal answers where exactness isn't expected, otherwise null
- units: the required units as a string (e.g. "cm²"), otherwise null
- preferred_input: "typed" for simple final answers (arithmetic, fractions, percentages, single
  values), "handwritten" for multi-step working, algebra, or geometry reasoning
- worked_solution: the full worked method, as LaTeX
- hint: a single nudge toward the next step, not the answer
- difficulty: "easy" | "standard" | "stretch"

Rules:
- Answers must be unambiguous and checkable — avoid questions with multiple valid interpretations.
- accepted_forms must be genuinely complete: list every equivalent form, not just one.
- Vary the numbers and contexts across questions rather than repeating a template.
- Self-check: work out each question's answer independently before writing it down. If you can't
  confirm the answer, discard that question and generate a different one instead.

Return ONLY strict JSON matching this shape, no code fences, no commentary:
{"questions": [ { ...one object per field above... } ]}`;

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { topic?: string; difficulty?: string; count?: number };
  const { topic, difficulty = "standard", count = 5 } = body;
  if (!topic || typeof topic !== "string") {
    return NextResponse.json({ error: "topic is required" }, { status: 400 });
  }

  const message = await anthropic.messages.create({
    model: capableModel(),
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\nDifficulty: ${difficulty}\nGenerate ${count} questions.`,
      },
    ],
  });

  const text = message.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("");

  let parsed: { questions: Question[] };
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch {
    return NextResponse.json({ error: "Model returned invalid JSON", raw: text }, { status: 502 });
  }

  return NextResponse.json(parsed);
}
