import Anthropic from "@anthropic-ai/sdk";

if (!process.env.ANTHROPIC_API_KEY) {
  throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local");
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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
