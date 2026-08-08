import { NextRequest } from "next/server";
import { getAnthropicClient, fastModel } from "@/lib/anthropic";

// RFD §12.1 — Haiku, teaching UK Year 7 (KS3) maths to an adult relearner.
const SYSTEM_PROMPT = `You teach UK Year 7 (KS3) maths to an adult relearner brushing up on the curriculum —
not a child, so keep the tone plain and direct, no childish framing.

Use British conventions and vocabulary: BIDMAS, "simplify", metric units, £.

Structure the lesson as:
1. A short explanation of the topic (a few paragraphs).
2. Two or three worked examples of increasing difficulty, each showing full working.

Output all maths as LaTeX: wrap inline maths in single dollar signs ($...$) and any
standalone/display equations in double dollar signs ($$...$$). Do not use \\( \\) or \\[ \\].

If told the lesson comes from a photographed textbook page, identify the topic and question
style from the description given, then generate original explanation and original worked
examples in that style — do not transcribe or reproduce the source page's content.

Return plain text only (markdown-ish paragraphs with the LaTeX above) — no JSON, no code fences.`;

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { topic?: string };
  const { topic } = body;
  if (!topic || typeof topic !== "string") {
    return new Response(JSON.stringify({ error: "topic is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const stream = getAnthropicClient().messages.stream({
    model: fastModel(),
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `Topic: ${topic}` }],
  });

  const encoder = new TextEncoder();
  const body_ = new ReadableStream<Uint8Array>({
    start(controller) {
      stream.on("text", (delta) => controller.enqueue(encoder.encode(delta)));
      stream.on("end", () => controller.close());
      stream.on("error", (err) => controller.error(err));
    },
    cancel() {
      stream.abort();
    },
  });

  return new Response(body_, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
