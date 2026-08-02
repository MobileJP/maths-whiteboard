import { NextRequest, NextResponse } from "next/server";
import { checkLocally, adjudicateNearMiss } from "@/lib/answerCheck";
import type { CheckResult, Question } from "@/lib/types";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { question?: Question; answer?: string };
  const { question, answer } = body;
  if (!question || typeof answer !== "string") {
    return NextResponse.json({ error: "question and answer are required" }, { status: 400 });
  }

  const local = checkLocally(question, answer);

  if (local.status === "correct") {
    return NextResponse.json<CheckResult>({ verdict: "correct", checked_locally: true });
  }
  if (local.status === "near_miss_units" || local.status === "near_miss_unsimplified") {
    return NextResponse.json<CheckResult>({ verdict: "near_miss", note: local.note, checked_locally: true });
  }
  if (local.status === "incorrect") {
    return NextResponse.json<CheckResult>({ verdict: "incorrect", checked_locally: true });
  }

  // status === "uncertain" — escalate. See RFD §9.3 / §8.
  const adjudication = await adjudicateNearMiss(question, answer);
  return NextResponse.json<CheckResult>({
    verdict: adjudication.correct ? "correct" : "incorrect",
    note: adjudication.note,
    checked_locally: false,
  });
}
