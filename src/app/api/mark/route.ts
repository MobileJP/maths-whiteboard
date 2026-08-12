import { NextRequest } from "next/server";
import { getAnthropicClient, capableModel } from "@/lib/anthropic";
import type { Question } from "@/lib/types";

// RFD §12.3 — Sonnet, marks against a known answer rather than solving from scratch.
const SYSTEM_PROMPT = `You mark a student's handwritten working for a UK Year 7 (KS3) maths question,
against a known question, canonical answer and worked solution that you are given below.

Rules:
- Transcribe the handwriting first, judge second. Never silently assume an unclear symbol —
  list anything genuinely ambiguous in unclear_symbols.
- Identify the FIRST error only, not its downstream consequences. If the student carries an
  early mistake correctly through later steps, that later working is not a separate error.
- Correct method with an arithmetic slip → verdict "partially_correct".
- Correct final answer reached via a different valid method to the stored solution → verdict
  "correct". Do not penalise a student for diverging from the stored method.
- If the handwriting is too unclear to judge, verdict "unclear" and explain why in method_note.
- method_note must describe WHAT went wrong at the first error. It must NEVER reveal the
  correct method or the correct answer — that holds regardless of what the student asked to
  see, because hint and full solution are shown separately, gated client-side, and this note
  is not gated at all.
- Return ONLY strict JSON, no code fences, no commentary, matching exactly:
{"transcription": "string", "transcription_confidence": "high|medium|low", "unclear_symbols": ["string"], "verdict": "correct|partially_correct|incorrect|unclear", "first_error": {"at_step": "string", "what_went_wrong": "string"} | null, "method_note": "string" | null}
first_error must be null when verdict is "correct". method_note may be null when there is nothing to add beyond first_error.`;

function questionContext(question: Question): string {
  return `Question: ${question.question_text}
Canonical answer: ${question.canonical_answer}
Worked solution: ${question.worked_solution}`;
}

function parseDataUrl(dataUrl: string): { mediaType: string; data: string } | null {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/.exec(dataUrl);
  if (!match) return null;
  return { mediaType: match[1] === "image/jpg" ? "image/jpeg" : match[1], data: match[2] };
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    question?: Question;
    image?: string; // data URL from Whiteboard.exportPNG()
    correctedWorking?: string; // "That's not what I wrote" retype path — text, no image
  };
  const { question, image, correctedWorking } = body;

  if (!question) {
    return new Response(JSON.stringify({ error: "question is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!image && !correctedWorking) {
    return new Response(JSON.stringify({ error: "image or correctedWorking is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const content: Array<
    { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/webp"; data: string } }
  > = [];

  if (image) {
    const parsed = parseDataUrl(image);
    if (!parsed) {
      return new Response(JSON.stringify({ error: "image must be a PNG/JPEG/WEBP data URL" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    content.push({
      type: "image",
      source: { type: "base64", media_type: parsed.mediaType as "image/png" | "image/jpeg" | "image/webp", data: parsed.data },
    });
    content.push({ type: "text", text: `${questionContext(question)}\n\nMark the attached handwritten working.` });
  } else {
    content.push({
      type: "text",
      text: `${questionContext(question)}\n\nThe student's working, already transcribed and confirmed correct by the student\n` +
        `(they corrected a previous misreading), so transcription_confidence must be "high" and\n` +
        `unclear_symbols must be empty — judge it as written, do not re-guess the transcription:\n\n${correctedWorking}`,
    });
  }

  const stream = getAnthropicClient().messages.stream({
    model: capableModel(),
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const encoder = new TextEncoder();
  const responseBody = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.abort();
    },
  });

  // Streamed as raw text (not SSE/JSON-lines): this is Claude's JSON response streaming token
  // by token. The client buffers the full body and parses it once as JSON — streaming here
  // exists only to keep the connection alive under Netlify's function timeout (RFD §12.4),
  // not to render partial output, since half a JSON object isn't useful to show.
  return new Response(responseBody, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
