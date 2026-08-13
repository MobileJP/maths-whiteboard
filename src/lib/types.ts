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

// Per RFD §5.1/§11 — the 35-lesson Year 7 scheme, the primary/default way to start a lesson.
export type Strand = "Number" | "Algebra" | "Ratio & Proportion" | "Geometry & Measures" | "Statistics" | "Probability";

export interface Topic {
  id: string; // `u${unitNumber}-l${lessonNumber}`, derived from array position, not authored
  strand: Strand;
  unitNumber: number; // 1–14, global across strands
  unitName: string;
  lessonNumber: number; // 1-based, resets per unit — matches "lesson 3 of module 1" phrasing
  name: string;
  description: string;
  order: number; // 1–35 global sequence, derived — drives the overall progress bar
}

export type TopicStatus = "not_started" | "in_progress" | "completed";

// A topic is "completed" once every question in its current cached generation has been
// attempted at least once — correctness is tracked but never gates status (RFD's "desirable
// difficulty over convenience": progress tracks retrieval-practice exposure, not a score gate).
export interface TopicProgress {
  status: TopicStatus;
  attemptedQuestionIndices: number[];
  correctQuestionIndices: number[]; // informational only
  questionsTotal: number | null;
  lastVisitedAt: string; // ISO
  completedAt: string | null;
}

export interface CachedLessonContent {
  lessonText: string;
  questions: Question[];
  generatedAt: string; // ISO
  sourceTopicPrompt: string; // debugging aid only, not compared programmatically
}
