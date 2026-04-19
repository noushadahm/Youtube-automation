import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const settingsSchema = z.object({
  openAiApiKey: z.string().optional().nullable(),
  geminiApiKey: z.string().optional().nullable(),
  elevenLabsApiKey: z.string().optional().nullable(),
  tavilyApiKey: z.string().optional().nullable(),
  newsApiKey: z.string().optional().nullable(),
  geminiImageModel: z.string().optional().nullable(),
  geminiVideoModel: z.string().optional().nullable(),
  defaultVoiceId: z.string().optional().nullable(),
  defaultElevenLabsModel: z.string().optional().nullable(),
  defaultAspectRatio: z.string().optional().nullable(),
  defaultSubtitleStyle: z.string().optional().nullable(),
  voiceStability: z.number().min(0).max(1).optional().nullable(),
  voiceSimilarityBoost: z.number().min(0).max(1).optional().nullable(),
  voiceStyle: z.number().min(0).max(1).optional().nullable(),
  voiceSpeakerBoost: z.boolean().optional().nullable()
});

function mask(key: string | null | undefined) {
  if (!key) return "";
  if (key.length <= 8) return "••••••";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}

export async function GET() {
  try {
    const user = await requireUser();
    const s = await db.settings.findUnique({ where: { userId: user.id } });
    return NextResponse.json({
      settings: s
        ? {
            openAiApiKeyMasked: mask(s.openAiApiKey),
            geminiApiKeyMasked: mask(s.geminiApiKey),
            elevenLabsApiKeyMasked: mask(s.elevenLabsApiKey),
            tavilyApiKeyMasked: mask(s.tavilyApiKey),
            newsApiKeyMasked: mask(s.newsApiKey),
            hasOpenAiApiKey: Boolean(s.openAiApiKey),
            hasGeminiApiKey: Boolean(s.geminiApiKey),
            hasElevenLabsApiKey: Boolean(s.elevenLabsApiKey),
            hasTavilyApiKey: Boolean(s.tavilyApiKey),
            hasNewsApiKey: Boolean(s.newsApiKey),
            geminiImageModel: s.geminiImageModel ?? "",
            geminiVideoModel: s.geminiVideoModel ?? "",
            defaultVoiceId: s.defaultVoiceId ?? "",
            defaultElevenLabsModel: s.defaultElevenLabsModel ?? "",
            defaultAspectRatio: s.defaultAspectRatio ?? "",
            defaultSubtitleStyle: s.defaultSubtitleStyle ?? "",
            voiceStability: s.voiceStability,
            voiceSimilarityBoost: s.voiceSimilarityBoost,
            voiceStyle: s.voiceStyle,
            voiceSpeakerBoost: s.voiceSpeakerBoost
          }
        : null
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json();
    const parsed = settingsSchema.parse(raw);

    // Empty strings mean "leave alone"; null explicitly clears.
    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === undefined) continue;
      if (value === "") continue;
      data[key] = value;
    }

    const settings = await db.settings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data
    });

    return NextResponse.json({
      ok: true,
      hasOpenAiApiKey: Boolean(settings.openAiApiKey),
      hasGeminiApiKey: Boolean(settings.geminiApiKey),
      hasElevenLabsApiKey: Boolean(settings.elevenLabsApiKey)
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save settings" },
      { status: 500 }
    );
  }
}
