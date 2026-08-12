import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

// Constructed lazily (on first actual use, not on module import) so a missing key only
// fails the routes that need it at request time, rather than failing `next build` entirely —
// Next.js evaluates every route module during page-data collection, so a throw at module
// scope here would break the whole build even for routes that never call the Anthropic API.
export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local (or the deploy environment's env vars)");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

function requireModel(envVar: "ANTHROPIC_MODEL_FAST" | "ANTHROPIC_MODEL_CAPABLE"): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(`${envVar} is not set — add it to .env.local`);
  }
  return value;
}

// Haiku — lesson text, explanations, chat, near-miss adjudication. See RFD §8.
export function fastModel(): string {
  return requireModel("ANTHROPIC_MODEL_FAST");
}

// Sonnet — question generation, handwriting marking, photo topic ID. See RFD §8.
export function capableModel(): string {
  return requireModel("ANTHROPIC_MODEL_CAPABLE");
}

// Models return JSON wrapped in ```json fences despite being told not to — strip defensively
// before parsing. Shared by every route that asks Claude for structured output.
export function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}
