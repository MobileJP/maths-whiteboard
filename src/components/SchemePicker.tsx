import type { Topic, TopicProgress } from "@/lib/types";
import { computeOverallPercent, deriveStatus } from "@/lib/progress";
import { getTopicById, groupScheme, YEAR7_SCHEME } from "@/lib/curriculum";

const STATUS_GLYPH: Record<string, string> = {
  not_started: "○",
  in_progress: "◐",
  completed: "●",
};

// Presentational only — no fetches or localStorage I/O of its own; the parent owns all reads
// and writes and passes the current state down, keeping the localStorage surface in one file.
export function SchemePicker({
  scheme = YEAR7_SCHEME,
  progressMap,
  currentPositionId,
  onSelectTopic,
}: {
  scheme?: readonly Topic[];
  progressMap: Record<string, TopicProgress>;
  currentPositionId: string | null;
  onSelectTopic: (topic: Topic) => void;
}) {
  const overallPercent = computeOverallPercent(progressMap, scheme);
  const continueTopic = currentPositionId ? getTopicById(currentPositionId) : undefined;
  const strandGroups = groupScheme(scheme);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
          <span>Year 7 progress</span>
          <span>{overallPercent}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width]"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </div>

      {continueTopic && (
        <button
          type="button"
          onClick={() => onSelectTopic(continueTopic)}
          className="rounded-lg border border-slate-900 bg-slate-900 px-4 py-3 text-left text-white"
        >
          <p className="text-xs uppercase tracking-wide text-slate-300">Continue where you left off</p>
          <p className="mt-1 font-medium">
            Unit {continueTopic.unitNumber} · Lesson {continueTopic.lessonNumber} — {continueTopic.name}
          </p>
        </button>
      )}

      <div className="flex flex-col gap-5">
        {strandGroups.map((group) => (
          <div key={group.strand}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {group.strand}
            </h3>
            <div className="flex flex-col gap-3">
              {group.units.map((unit) => (
                <div key={unit.unitNumber}>
                  <p className="mb-1 text-sm font-medium text-slate-700">
                    Unit {unit.unitNumber} — {unit.unitName}
                  </p>
                  <ul className="flex flex-col gap-1">
                    {unit.lessons.map((lesson) => {
                      const progress = progressMap[lesson.id];
                      const status = progress ? deriveStatus(progress) : "not_started";
                      const attemptedCount = progress?.attemptedQuestionIndices.length ?? 0;
                      const total = progress?.questionsTotal ?? null;
                      return (
                        <li key={lesson.id}>
                          <button
                            type="button"
                            onClick={() => onSelectTopic(lesson)}
                            className="flex w-full items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:border-slate-400"
                          >
                            <span aria-hidden className="text-slate-400">
                              {STATUS_GLYPH[status]}
                            </span>
                            <span className="flex-1">
                              Lesson {lesson.lessonNumber} — {lesson.name}
                            </span>
                            {total !== null && (
                              <span className="text-xs text-slate-400">
                                {attemptedCount}/{total}
                              </span>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
