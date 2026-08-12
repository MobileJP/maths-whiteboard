export type AnswerType = "numeric" | "fraction" | "expression" | "ratio" | "text" | "multi";
export type PreferredInput = "typed" | "handwritten";
export type Difficulty = "easy" | "standard" | "stretch";

// Per RFD §12.2 — always generated together, in the same model response.
export interface Question {
  question_text: string; // LaTeX
  answer_type: AnswerType;
  canonical_answer: string;
  accepted_forms: string[];
  tolerance: number | null;
  units: string | null;
  preferred_input: PreferredInput;
  worked_solution: string;
  hint: string;
  difficulty: Difficulty;
}

export interface Lesson {
  title: string;
  content: string; // markdown-ish text with LaTeX in $...$ / $$...$$
}

export type CheckVerdict = "correct" | "near_miss" | "incorrect";

export interface CheckResult {
  verdict: CheckVerdict;
  note?: string; // e.g. "right value, wrong units" / "unsimplified but equivalent"
  checked_locally: boolean; // false only when the Haiku near-miss adjudication ran
}

// Per RFD §12.3 — handwriting marking (Sonnet). Transcribe first, judge second.
export type TranscriptionConfidence = "high" | "medium" | "low";
export type MarkVerdict = "correct" | "partially_correct" | "incorrect" | "unclear";

export interface MarkResult {
  transcription: string;
  transcription_confidence: TranscriptionConfidence;
  unclear_symbols: string[];
  verdict: MarkVerdict;
  first_error: { at_step: string; what_went_wrong: string } | null; // null when verdict is "correct"
  method_note: string | null;
}
