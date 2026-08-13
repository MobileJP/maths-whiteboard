"use client";

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { KatexText } from "@/components/KatexText";
import { MathField } from "@/components/MathField";
import { Whiteboard, type WhiteboardHandle } from "@/components/Whiteboard";
import type { CheckResult, MarkResult, Question } from "@/lib/types";

// Mirrors stripCodeFences in src/lib/anthropic.ts — duplicated here rather than imported so
// this client component doesn't pull the Anthropic SDK into the browser bundle.
function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}

async function readStreamedText(res: Response): Promise<string> {
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

type ResponseMode = "mark_only" | "mark_and_hint" | "full_solution";
type InputMode = "typed" | "handwritten";

const SPLIT_STORAGE_KEY = "mw-split-percent";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [lessonText, setLessonText] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [responseMode, setResponseMode] = useState<ResponseMode>("mark_only");

  const [error, setError] = useState<string | null>(null);

  const splitContainerRef = useRef<HTMLDivElement>(null);
  // Lazy init reads localStorage directly rather than via an effect + setState; this only
  // ever runs client-side (currentQuestion gates all client-only rendering below it), so
  // there's no server/client markup to reconcile for this value.
  const [splitPercent, setSplitPercent] = useState<number>(() => {
    if (typeof window === "undefined") return 50;
    const stored = window.localStorage.getItem(SPLIT_STORAGE_KEY);
    return stored ? Number(stored) : 50;
  });

  const startDivider = useCallback((downEvent: ReactPointerEvent) => {
    downEvent.preventDefault();
    const container = splitContainerRef.current;
    if (!container) return;
    const onMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const pct = Math.min(75, Math.max(25, ((e.clientX - rect.left) / rect.width) * 100));
      setSplitPercent(pct);
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setSplitPercent((pct) => {
        window.localStorage.setItem(SPLIT_STORAGE_KEY, String(pct));
        return pct;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const currentQuestion = questions[currentIndex] ?? null;

  const startLesson = useCallback(async () => {
    if (!topic.trim()) return;
    setError(null);
    setLessonText("");
    setLessonLoading(true);
    setQuestions([]);
    setCurrentIndex(0);

    const questionsPromise = (async () => {
      setQuestionsLoading(true);
      try {
        const res = await fetch("/api/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic, difficulty: "standard", count: 5 }),
        });
        if (!res.ok) throw new Error(`Question generation failed (${res.status})`);
        const data = (await res.json()) as { questions: Question[] };
        setQuestions(data.questions ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate questions");
      } finally {
        setQuestionsLoading(false);
      }
    })();

    const lessonPromise = (async () => {
      try {
        const res = await fetch("/api/lesson", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic }),
        });
        if (!res.ok || !res.body) throw new Error(`Lesson generation failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          setLessonText((prev) => prev + decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate lesson");
      } finally {
        setLessonLoading(false);
      }
    })();

    await Promise.all([questionsPromise, lessonPromise]);
  }, [topic]);

  const nextQuestion = () => {
    setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">Maths Whiteboard</h1>
        <p className="text-sm text-slate-500">
          Phase 1 (local) — lesson + question generation, typed answer checking, handwritten answer marking
        </p>
      </header>

      <div className="mx-auto flex max-w-2xl gap-2 px-6 py-4">
        <input
          className="flex-1 rounded-md border border-slate-300 px-3 py-2"
          placeholder="Teach me… e.g. adding fractions with different denominators"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && startLesson()}
        />
        <button
          className="rounded-md bg-slate-900 px-4 py-2 text-white disabled:opacity-40"
          onClick={startLesson}
          disabled={lessonLoading || questionsLoading || !topic.trim()}
        >
          {lessonLoading || questionsLoading ? "Working…" : "Teach me"}
        </button>
      </div>

      {error && (
        <div className="mx-auto max-w-2xl px-6">
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        </div>
      )}

      <main
        ref={splitContainerRef}
        className="mx-auto grid max-w-6xl gap-0 px-6 py-6"
        style={{ gridTemplateColumns: `${splitPercent}% 8px 1fr` }}
        suppressHydrationWarning
      >
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-medium">Lesson</h2>
          {lessonText ? (
            <div className="prose prose-slate max-w-none text-[15px] leading-relaxed">
              <KatexText text={lessonText} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Type a topic above to get a lesson.</p>
          )}
        </section>

        <div
          role="separator"
          aria-orientation="vertical"
          onPointerDown={startDivider}
          className="mx-1 cursor-col-resize rounded-full bg-slate-200 hover:bg-slate-300"
          style={{ touchAction: "none" }}
        />

        <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-medium">Practice</h2>

          {questionsLoading && questions.length === 0 && (
            <p className="text-sm text-slate-400">Generating questions…</p>
          )}

          {currentQuestion && (
            <QuestionPanel
              key={currentIndex}
              question={currentQuestion}
              questionNumber={currentIndex + 1}
              total={questions.length}
              responseMode={responseMode}
              onResponseModeChange={setResponseMode}
              onError={setError}
              onNext={nextQuestion}
              hasNext={currentIndex < questions.length - 1}
            />
          )}
        </section>
      </main>
    </div>
  );
}

// Keyed by question index from the parent, so switching questions remounts this
// component and resets all local state for free — no effect-based reset needed.
function QuestionPanel({
  question,
  questionNumber,
  total,
  responseMode,
  onResponseModeChange,
  onError,
  onNext,
  hasNext,
}: {
  question: Question;
  questionNumber: number;
  total: number;
  responseMode: ResponseMode;
  onResponseModeChange: (mode: ResponseMode) => void;
  onError: (message: string) => void;
  onNext: () => void;
  hasNext: boolean;
}) {
  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);

  const [marking, setMarking] = useState(false);
  const [markResult, setMarkResult] = useState<MarkResult | null>(null);
  const [retyping, setRetyping] = useState(false);
  const [retypeText, setRetypeText] = useState("");

  const [hintRevealed, setHintRevealed] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);
  const [activeInput, setActiveInput] = useState<InputMode>(question.preferred_input);
  const whiteboardRef = useRef<WhiteboardHandle>(null);

  const runMark = useCallback(
    async (body: { image?: string; correctedWorking?: string }) => {
      setMarking(true);
      try {
        const res = await fetch("/api/mark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, ...body }),
        });
        const text = await readStreamedText(res);
        const parsed = JSON.parse(stripCodeFences(text)) as MarkResult;
        setMarkResult(parsed);
        setHintRevealed(false);
        setSolutionRevealed(false);
        setRetyping(false);
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to mark drawing");
      } finally {
        setMarking(false);
      }
    },
    [question, onError],
  );

  const submitDrawing = useCallback(async () => {
    const board = whiteboardRef.current;
    if (!board || board.isEmpty()) return;
    await runMark({ image: board.exportPNG() });
  }, [runMark]);

  const submitRetype = useCallback(async () => {
    if (!retypeText.trim()) return;
    await runMark({ correctedWorking: retypeText });
  }, [retypeText, runMark]);

  const submitAnswer = useCallback(async () => {
    if (!answer.trim()) return;
    setChecking(true);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, answer }),
      });
      if (!res.ok) throw new Error(`Check failed (${res.status})`);
      const data = (await res.json()) as CheckResult;
      setCheckResult(data);
      setHintRevealed(false);
      setSolutionRevealed(false);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to check answer");
    } finally {
      setChecking(false);
    }
  }, [question, answer, onError]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p className="text-sm text-slate-500">
        Q{questionNumber} of {total} · {question.difficulty}
      </p>

      <div className="text-lg">
        <KatexText text={question.question_text} />
      </div>

      {/* RFD §10.1: both affordances are reachable; whichever is touched becomes
          active and the other collapses to a "show" strip. */}
      {activeInput === "typed" ? (
        <div className="flex flex-col gap-2">
          <MathField value={answer} onChange={setAnswer} placeholder="Type your answer…" />
          <button
            type="button"
            className="self-start text-xs text-slate-500 underline"
            onClick={() => setActiveInput("handwritten")}
          >
            ✏️ Show whiteboard instead
          </button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-2">
          <Whiteboard ref={whiteboardRef} />
          <button
            type="button"
            className="self-start text-xs text-slate-500 underline"
            onClick={() => setActiveInput("typed")}
          >
            ⌨️ Show typed answer instead
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <select
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          value={responseMode}
          onChange={(e) => onResponseModeChange(e.target.value as ResponseMode)}
        >
          <option value="mark_only">Mark only</option>
          <option value="mark_and_hint">Mark + hint</option>
          <option value="full_solution">Full solution</option>
        </select>
        {activeInput === "typed" ? (
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={submitAnswer}
            disabled={checking || !answer.trim()}
          >
            {checking ? "Checking…" : "Submit"}
          </button>
        ) : (
          <button
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={submitDrawing}
            disabled={marking}
          >
            {marking ? "Marking…" : "Submit drawing"}
          </button>
        )}
      </div>

      {checkResult && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p
            className={
              checkResult.verdict === "correct"
                ? "font-medium text-emerald-700"
                : checkResult.verdict === "near_miss"
                  ? "font-medium text-amber-700"
                  : "font-medium text-red-700"
            }
          >
            {checkResult.verdict === "correct" && "✓ Correct"}
            {checkResult.verdict === "near_miss" && "≈ Close"}
            {checkResult.verdict === "incorrect" && "✗ Not quite"}
            {!checkResult.checked_locally && " (adjudicated)"}
          </p>
          {checkResult.note && <p className="mt-1 text-sm text-slate-600">{checkResult.note}</p>}

          {checkResult.verdict !== "correct" && (
            <HintSolutionControls
              question={question}
              responseMode={responseMode}
              hintRevealed={hintRevealed}
              solutionRevealed={solutionRevealed}
              onRevealHint={() => setHintRevealed(true)}
              onRevealSolution={() => setSolutionRevealed(true)}
            />
          )}
        </div>
      )}

      {/* RFD §10.4: transcription-first display — what Claude read, before the verdict, so a
          misread becomes a correction rather than an untrusted wrong mark. */}
      {markResult && (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-sm text-slate-500">I read your working as:</p>
          <div className="mt-1 rounded-md border border-slate-200 bg-white p-2 text-sm">
            <KatexText text={markResult.transcription} />
          </div>

          {retyping ? (
            <div className="mt-2 flex flex-col gap-2">
              <textarea
                className="w-full rounded-md border border-slate-300 p-2 text-sm"
                rows={3}
                value={retypeText}
                onChange={(e) => setRetypeText(e.target.value)}
                placeholder="Type your working as you actually wrote it…"
              />
              <div className="flex gap-2">
                <button
                  className="rounded-md bg-slate-900 px-3 py-1 text-sm text-white disabled:opacity-40"
                  onClick={submitRetype}
                  disabled={marking || !retypeText.trim()}
                >
                  {marking ? "Re-marking…" : "Re-mark"}
                </button>
                <button
                  type="button"
                  className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                  onClick={() => setRetyping(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="mt-2 text-xs text-slate-500 underline"
              onClick={() => {
                setRetypeText(markResult.transcription);
                setRetyping(true);
              }}
            >
              That&apos;s not what I wrote
            </button>
          )}

          {markResult.transcription_confidence === "low" && !retyping ? (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              That was hard to read clearly, so the mark below may be unreliable — try writing a
              little larger, or correct the transcription above.
            </p>
          ) : (
            !retyping && (
              <>
                <p
                  className={
                    markResult.verdict === "correct"
                      ? "mt-3 font-medium text-emerald-700"
                      : markResult.verdict === "partially_correct"
                        ? "mt-3 font-medium text-amber-700"
                        : markResult.verdict === "incorrect"
                          ? "mt-3 font-medium text-red-700"
                          : "mt-3 font-medium text-slate-500"
                  }
                >
                  {markResult.verdict === "correct" && "✓ Correct"}
                  {markResult.verdict === "partially_correct" && "≈ Partially correct"}
                  {markResult.verdict === "incorrect" && "✗ Not quite"}
                  {markResult.verdict === "unclear" && "? Unclear"}
                </p>

                {markResult.first_error && (
                  <p className="mt-1 text-sm text-slate-600">
                    <strong>First error ({markResult.first_error.at_step}):</strong>{" "}
                    {markResult.first_error.what_went_wrong}
                  </p>
                )}
                {markResult.method_note && (
                  <p className="mt-1 text-sm text-slate-600">{markResult.method_note}</p>
                )}

                {markResult.verdict !== "correct" && (
                  <HintSolutionControls
                    question={question}
                    responseMode={responseMode}
                    hintRevealed={hintRevealed}
                    solutionRevealed={solutionRevealed}
                    onRevealHint={() => setHintRevealed(true)}
                    onRevealSolution={() => setSolutionRevealed(true)}
                  />
                )}
              </>
            )
          )}
        </div>
      )}

      <button
        className="self-start text-sm text-slate-500 underline disabled:opacity-40"
        onClick={onNext}
        disabled={!hasNext}
      >
        Next question →
      </button>
    </div>
  );
}

// Shared between the typed and handwritten verdict displays — same gating rule either way:
// hint needs mark_and_hint or better, full solution needs full_solution. RFD §10.4/§5.4.
function HintSolutionControls({
  question,
  responseMode,
  hintRevealed,
  solutionRevealed,
  onRevealHint,
  onRevealSolution,
}: {
  question: Question;
  responseMode: ResponseMode;
  hintRevealed: boolean;
  solutionRevealed: boolean;
  onRevealHint: () => void;
  onRevealSolution: () => void;
}) {
  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {(responseMode === "mark_and_hint" || responseMode === "full_solution") && !hintRevealed && (
          <button className="rounded-md border border-slate-300 px-3 py-1 text-sm" onClick={onRevealHint}>
            Hint
          </button>
        )}
        {responseMode === "full_solution" && !solutionRevealed && (
          <button className="rounded-md border border-slate-300 px-3 py-1 text-sm" onClick={onRevealSolution}>
            Show full solution
          </button>
        )}
      </div>

      {hintRevealed && (
        <p className="mt-2 text-sm text-slate-700">
          <strong>Hint: </strong>
          <KatexText text={question.hint} />
        </p>
      )}
      {solutionRevealed && (
        <div className="mt-2 text-sm text-slate-700">
          <strong>Solution: </strong>
          <KatexText text={question.worked_solution} />
        </div>
      )}
    </>
  );
}
