import OpenAI from "openai";
import { getEnv } from "@/lib/env";

/**
 * Returns a per-call OpenAI client. Pass a user-supplied apiKey when available;
 * falls back to the server env var otherwise.
 */
export function getOpenAIClient(apiKey?: string) {
  const key = apiKey ?? getEnv().openAiApiKey;
  if (!key) {
    throw new Error("OpenAI API key not set. Add it under Settings, or set OPENAI_API_KEY.");
  }
  return new OpenAI({ apiKey: key });
}
