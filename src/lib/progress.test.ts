import { describe, expect, it } from "vitest";
import { computeOverallPercent, deriveStatus, recordAttempt, recordVisit } from "./progress";
import type { Topic, TopicProgress } from "./types";

const TOPIC_ID = "u1-l1";

function topic(id: string, order: number): Topic {
  return {
    id,
    strand: "Number",
    unitNumber: 1,
    unitName: "Test Unit",
    lessonNumber: 1,
    name: "Test lesson",
    description: "",
    order,
  };
}

describe("deriveStatus", () => {
  it("is not_started with zero attempts", () => {
    expect(deriveStatus({ attemptedQuestionIndices: [], questionsTotal: 5 })).toBe("not_started");
  });

  it("is in_progress with some but not all questions attempted", () => {
    expect(deriveStatus({ attemptedQuestionIndices: [0, 1], questionsTotal: 5 })).toBe("in_progress");
  });

  it("is completed once every question has been attempted, regardless of correctness", () => {
    expect(deriveStatus({ attemptedQuestionIndices: [0, 1, 2, 3, 4], questionsTotal: 5 })).toBe("completed");
  });

  it("is in_progress (not completed) when questionsTotal is unknown", () => {
    expect(deriveStatus({ attemptedQuestionIndices: [0, 1], questionsTotal: null })).toBe("in_progress");
  });
});

describe("recordVisit", () => {
  it("creates a fresh not_started entry for a topic seen for the first time", () => {
    const next = recordVisit({}, TOPIC_ID, 5);
    expect(next[TOPIC_ID].status).toBe("not_started");
    expect(next[TOPIC_ID].questionsTotal).toBe(5);
  });

  it("preserves prior attempts on a normal (cache-hit) revisit", () => {
    const withAttempt = recordAttempt({}, TOPIC_ID, 0, true, 3);
    const revisited = recordVisit(withAttempt, TOPIC_ID, 3);
    expect(revisited[TOPIC_ID].attemptedQuestionIndices).toEqual([0]);
  });

  it("clears prior attempts when resetAttempts is true (forced regeneration)", () => {
    const withAttempt = recordAttempt({}, TOPIC_ID, 0, true, 3);
    const regenerated = recordVisit(withAttempt, TOPIC_ID, 4, true);
    expect(regenerated[TOPIC_ID].attemptedQuestionIndices).toEqual([]);
    expect(regenerated[TOPIC_ID].completedAt).toBeNull();
    expect(regenerated[TOPIC_ID].questionsTotal).toBe(4);
  });
});

describe("recordAttempt", () => {
  it("flips to completed once the last remaining question is attempted", () => {
    let map: Record<string, TopicProgress> = {};
    map = recordAttempt(map, TOPIC_ID, 0, true, 2);
    expect(map[TOPIC_ID].status).toBe("in_progress");
    map = recordAttempt(map, TOPIC_ID, 1, false, 2);
    expect(map[TOPIC_ID].status).toBe("completed");
    expect(map[TOPIC_ID].completedAt).not.toBeNull();
  });

  it("does not gate completion on correctness — all-wrong still completes", () => {
    let map: Record<string, TopicProgress> = {};
    map = recordAttempt(map, TOPIC_ID, 0, false, 1);
    expect(map[TOPIC_ID].status).toBe("completed");
    expect(map[TOPIC_ID].correctQuestionIndices).toEqual([]);
  });

  it("re-attempting the same question index does not double-count", () => {
    let map: Record<string, TopicProgress> = {};
    map = recordAttempt(map, TOPIC_ID, 0, true, 3);
    map = recordAttempt(map, TOPIC_ID, 0, false, 3);
    expect(map[TOPIC_ID].attemptedQuestionIndices).toEqual([0]);
    expect(map[TOPIC_ID].status).toBe("in_progress");
  });

  it("tracks correctQuestionIndices without letting them affect status", () => {
    let map: Record<string, TopicProgress> = {};
    map = recordAttempt(map, TOPIC_ID, 0, true, 2);
    map = recordAttempt(map, TOPIC_ID, 1, true, 2);
    expect(map[TOPIC_ID].correctQuestionIndices).toEqual([0, 1]);
    expect(map[TOPIC_ID].status).toBe("completed");
  });
});

describe("computeOverallPercent", () => {
  it("is 0 for an empty scheme", () => {
    expect(computeOverallPercent({}, [])).toBe(0);
  });

  it("is 0 when nothing is completed", () => {
    const scheme = [topic("a", 1), topic("b", 2)];
    expect(computeOverallPercent({}, scheme)).toBe(0);
  });

  it("computes the percentage of completed topics against the whole scheme", () => {
    const scheme = [topic("a", 1), topic("b", 2), topic("c", 3), topic("d", 4)];
    let map = recordAttempt({}, "a", 0, true, 1); // completes "a"
    map = recordAttempt(map, "b", 0, true, 2); // "b" only half-attempted
    expect(computeOverallPercent(map, scheme)).toBe(25);
  });
});
