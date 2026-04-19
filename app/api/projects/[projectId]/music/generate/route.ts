import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { ElevenLabsService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";
import { uploadBuffer } from "@/lib/storage";

const env = getEnv();

/**
 * Generate a music/SFX track from a text prompt using ElevenLabs Music.
 * Saved as an Asset(type=music) with the provided offset/volume so it drops
 * straight into the multi-track mixer.
 *
 * Body: { prompt, durationSec?, volume?, offsetSec?, label? }
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const owned = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id }
    });
    if (!owned) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }
    const durationSec =
      typeof body.durationSec === "number" && body.durationSec > 0 ? body.durationSec : 30;
    const volume =
      typeof body.volume === "number" && body.volume >= 0 && body.volume <= 1
        ? body.volume
        : 0.25;
    const offsetSec =
      typeof body.offsetSec === "number" && body.offsetSec >= 0 ? body.offsetSec : 0;
    const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : "AI music";

    const keys = await getUserAiKeys(user.id);
    const svc = new ElevenLabsService({ apiKey: keys.elevenLabsApiKey });
    const buffer = await svc.generateMusic(prompt, durationSec);

    // Persist locally for FFmpeg + storage copy for Lambda-safety.
    const outputDir = path.join(env.mediaRoot, params.projectId, "music");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `music-ai-${randomUUID()}.mp3`);
    await fs.writeFile(outputPath, buffer);

    const storagePath = `projects/${params.projectId}/music/${path.basename(outputPath)}`;
    await uploadBuffer({
      path: storagePath,
      buffer,
      contentType: "audio/mpeg"
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "music",
        provider: "elevenlabs-music",
        localPath: outputPath,
        url: storagePath,
        metadataJson: {
          label,
          volume,
          offsetSec,
          trimStartSec: 0,
          durationSec,
          sourceType: "ai_generated",
          promptUsed: prompt
        }
      }
    });

    return NextResponse.json({ assetId: asset.id, durationSec, label });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[music-generate] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Music generation failed" },
      { status: 500 }
    );
  }
}
