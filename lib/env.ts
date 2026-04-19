const recommendedServerVars = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
] as const;

export function getEnv() {
  for (const key of recommendedServerVars) {
    if (!process.env[key]) {
      console.warn(`[env] Missing recommended variable: ${key}`);
    }
  }

  return {
    openAiApiKey: process.env.OPENAI_API_KEY,
    geminiApiKey: process.env.GEMINI_API_KEY,
    elevenLabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenLabsModel: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
    databaseUrl: process.env.DATABASE_URL,
    directUrl: process.env.DIRECT_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseStorageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "sf-media",
    mediaRoot: process.env.MEDIA_ROOT ?? "/tmp/storyflow",
    ffmpegPath: process.env.FFMPEG_PATH ?? "ffmpeg",
    redisUrl: process.env.REDIS_URL ?? "redis://127.0.0.1:6379"
  };
}
