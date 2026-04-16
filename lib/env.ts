const requiredServerVars = ["DATABASE_URL", "REDIS_URL"] as const;

export function getEnv() {
  for (const key of requiredServerVars) {
    if (!process.env[key]) {
      console.warn(`[env] Missing optional-but-recommended variable: ${key}`);
    }
  }

  return {
    openAiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenLabsModel: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
    databaseUrl: process.env.DATABASE_URL,
    redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
    mediaRoot: process.env.MEDIA_ROOT ?? "./storage",
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg"
  };
}
