import type { CachedLessonContent, Topic, TopicProgress, TopicStatus } from "./types";

// Three separate keys, not one blob: cache entries are large/disposable and regeneratable,
// progress is small and precious, position is tiny and written on every navigation — keeping
// them apart means clearing one can't accidentally take out another. `-v1` (unlike the existing
// unversioned `mw-split-percent` key) because this is real JSON with no migration path yet.
const PROGRESS_KEY = "mw-progress-v1";
const POSITION_KEY = "mw-current-position-v1";
const CACHE_KEY = "mw-lesson-cache-v1";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function readProgressMap(): Record<string, TopicProgress> {
  return readJSON(PROGRESS_KEY, {});
}

export function writeProgressMap(map: Record<string, TopicProgress>): void {
  writeJSON(PROGRESS_KEY, map);
}

export function readPosition(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(POSITION_KEY);
}

export function writePosition(topicId: string): void {
  window.localStorage.setItem(POSITION_KEY, topicId);
}

export function readCacheMap(): Record<string, CachedLessonContent> {
  return readJSON(CACHE_KEY, {});
}

export function writeCacheMap(map: Record<string, CachedLessonContent>): void {
  writeJSON(CACHE_KEY, map);
}

// A topic is "completed" once every question in its current cached generation has been
// attempted at least once — correctness never gates status (see TopicProgress in types.ts).
export function deriveStatus(p: Pick<TopicProgress, "attemptedQuestionIndices" | "questionsTotal">): TopicStatus {
  if (p.attemptedQuestionIndices.length === 0) return "not_started";
  if (p.questionsTotal !== null && p.attemptedQuestionIndices.length >= p.questionsTotal) return "completed";
  return "in_progress";
}

function emptyProgress(): TopicProgress {
  return {
    status: "not_started",
    attemptedQuestionIndices: [],
    correctQuestionIndices: [],
    questionsTotal: null,
    lastVisitedAt: new Date().toISOString(),
    completedAt: null,
  };
}

// Called when a topic is opened (cache hit or miss). `resetAttempts` is true on a forced
// regeneration, since the old attempted/correct indices no longer correspond to the new
// question set. `questionsTotal` is only known once a generation exists (cached or fresh).
export function recordVisit(
  map: Record<string, TopicProgress>,
  topicId: string,
  questionsTotal?: number,
  resetAttempts = false,
): Record<string, TopicProgress> {
  const existing = map[topicId] ?? emptyProgress();
  const base = resetAttempts
    ? { ...existing, attemptedQuestionIndices: [], correctQuestionIndices: [], completedAt: null }
    : existing;

  const next: TopicProgress = {
    ...base,
    questionsTotal: questionsTotal ?? base.questionsTotal,
    lastVisitedAt: new Date().toISOString(),
  };
  next.status = deriveStatus(next);

  return { ...map, [topicId]: next };
}

export function recordAttempt(
  map: Record<string, TopicProgress>,
  topicId: string,
  questionIndex: number,
  wasCorrect: boolean,
  questionsTotal: number,
): Record<string, TopicProgress> {
  const existing = map[topicId] ?? emptyProgress();

  const attemptedQuestionIndices = existing.attemptedQuestionIndices.includes(questionIndex)
    ? existing.attemptedQuestionIndices
    : [...existing.attemptedQuestionIndices, questionIndex];

  const correctQuestionIndices = wasCorrect && !existing.correctQuestionIndices.includes(questionIndex)
    ? [...existing.correctQuestionIndices, questionIndex]
    : existing.correctQuestionIndices;

  const next: TopicProgress = {
    ...existing,
    attemptedQuestionIndices,
    correctQuestionIndices,
    questionsTotal,
    lastVisitedAt: new Date().toISOString(),
    status: "not_started", // placeholder, recomputed below
    completedAt: existing.completedAt,
  };
  next.status = deriveStatus(next);
  if (next.status === "completed" && !next.completedAt) {
    next.completedAt = new Date().toISOString();
  }

  return { ...map, [topicId]: next };
}

export function computeOverallPercent(
  progressMap: Record<string, TopicProgress>,
  scheme: readonly Topic[],
): number {
  if (scheme.length === 0) return 0;
  const completedCount = scheme.filter((t) => progressMap[t.id]?.status === "completed").length;
  return Math.round((completedCount / scheme.length) * 100);
}
