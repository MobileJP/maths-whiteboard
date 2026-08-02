"use client";

import { useCallback, useState } from "react";
import { KatexText } from "@/components/KatexText";
import { MathField } from "@/components/MathField";
import type { CheckResult, Question } from "@/lib/types";

type ResponseMode = "mark_only" | "mark_and_hint" | "full_solution";

export default function Home() {
  const [topic, setTopic] = useState("");
  const [lessonText, setLessonText] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const [answer, setAnswer] = useState("");
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const [responseMode, setResponseMode] = useState<ResponseMode>("mark_only");
  const [hintRevealed, setHintRevealed] = useState(false);
  const [solutionRevealed, setSolutionRevealed] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex] ?? null;

  const resetQuestionState = () => {
    setAnswer("");
    setCheckResult(null);
    setHintRevealed(false);
    setSolutionRevealed(false);
  };

  const startLesson = useCallback(async () => {
    if (!topic.trim()) return;
    setError(null);
    setLessonText("");
    setLessonLoading(true);
    setQuestions([]);
    setCurrentIndex(0);
    resetQuestionState();

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

  const submitAnswer = useCallback(async () => {
    if (!currentQuestion || !answer.trim()) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentQuestion, answer }),
      });
      if (!res.ok) throw new Error(`Check failed (${res.status})`);
      const data = (await res.json()) as CheckResult;
      setCheckResult(data);
      setHintRevealed(false);
      setSolutionRevealed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to check answer");
    } finally {
      setChecking(false);
    }
  }, [currentQuestion, answer]);

  const nextQuestion = () => {
    setCurrentIndex((i) => Math.min(i + 1, questions.length - 1));
    resetQuestionState();
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">Maths Whiteboard</h1>
        <p className="text-sm text-slate-500">Phase 1 (local) — lesson + question generation + typed answer checking</p>
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

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-2">
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

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="mb-3 text-lg font-medium">Practice</h2>

          {questionsLoading && questions.length === 0 && (
            <p className="text-sm text-slate-400">Generating questions…</p>
          )}

          {currentQuestion && (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-500">
                Q{currentIndex + 1} of {questions.length} · {currentQuestion.difficulty}
              </p>

              <div className="text-lg">
                <KatexText text={currentQuestion.question_text} />
              </div>

              <MathField value={answer} onChange={setAnswer} placeholder="Type your answer…" />

              <div className="flex items-center gap-3">
                <select
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm"
                  value={responseMode}
                  onChange={(e) => setResponseMode(e.target.value as ResponseMode)}
                >
                  <option value="mark_only">Mark only</option>
                  <option value="mark_and_hint">Mark + hint</option>
                  <option value="full_solution">Full solution</option>
                </select>
                <button
                  className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-40"
                  onClick={submitAnswer}
                  disabled={checking || !answer.trim()}
                >
                  {checking ? "Checking…" : "Submit"}
                </button>
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
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(responseMode === "mark_and_hint" || responseMode === "full_solution") && !hintRevealed && (
                        <button
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                          onClick={() => setHintRevealed(true)}
                        >
                          Hint
                        </button>
                      )}
                      {responseMode === "full_solution" && !solutionRevealed && (
                        <button
                          className="rounded-md border border-slate-300 px-3 py-1 text-sm"
                          onClick={() => setSolutionRevealed(true)}
                        >
                          Show full solution
                        </button>
                      )}
                    </div>
                  )}

                  {hintRevealed && (
                    <p className="mt-2 text-sm text-slate-700">
                      <strong>Hint: </strong>
                      <KatexText text={currentQuestion.hint} />
                    </p>
                  )}
                  {solutionRevealed && (
                    <div className="mt-2 text-sm text-slate-700">
                      <strong>Solution: </strong>
                      <KatexText text={currentQuestion.worked_solution} />
                    </div>
                  )}
                </div>
              )}

              <button
                className="self-start text-sm text-slate-500 underline disabled:opacity-40"
                onClick={nextQuestion}
                disabled={currentIndex >= questions.length - 1}
              >
                Next question →
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}