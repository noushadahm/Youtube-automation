import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

export interface UserAiKeys {
  openAiApiKey?: string;
  geminiApiKey?: string;
  geminiImageModel?: string;
  geminiVideoModel?: string;
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModel?: string;
  voiceStability?: number;
  voiceSimilarityBoost?: number;
  voiceStyle?: number;
  voiceSpeakerBoost?: boolean;
  /** Optional news/grounding providers (either is fine — Tavily preferred). */
  tavilyApiKey?: string;
  newsApiKey?: string;
}

/**
 * Resolve AI provider credentials for a user. Order of preference:
 *   1. User's saved Settings row
 *   2. Server-wide env vars (fallback / dev-only)
 */
export async function getUserAiKeys(userId: string): Promise<UserAiKeys> {
  const env = getEnv();
  const s = await db.settings.findUnique({ where: { userId } });

  return {
    openAiApiKey: s?.openAiApiKey ?? env.openAiApiKey,
    geminiApiKey: s?.geminiApiKey ?? env.geminiApiKey,
    geminiImageModel: s?.geminiImageModel ?? undefined,
    geminiVideoModel: s?.geminiVideoModel ?? undefined,
    elevenLabsApiKey: s?.elevenLabsApiKey ?? env.elevenLabsApiKey,
    elevenLabsVoiceId: s?.defaultVoiceId ?? env.elevenLabsVoiceId,
    elevenLabsModel:
      s?.defaultElevenLabsModel ?? env.elevenLabsModel ?? "eleven_multilingual_v2",
    voiceStability: s?.voiceStability ?? undefined,
    voiceSimilarityBoost: s?.voiceSimilarityBoost ?? undefined,
    voiceStyle: s?.voiceStyle ?? undefined,
    voiceSpeakerBoost: s?.voiceSpeakerBoost ?? undefined,
    tavilyApiKey: s?.tavilyApiKey ?? process.env.TAVILY_API_KEY ?? undefined,
    newsApiKey: s?.newsApiKey ?? process.env.NEWS_API_KEY ?? undefined
  };
}
