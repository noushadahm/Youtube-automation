import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { GeminiService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";
import { uploadBuffer } from "@/lib/storage";

const env = getEnv();

/**
 * Generate a YouTube-style cover / thumbnail image for the project.
 * Uses Gemini with a thumbnail-optimised prompt (dramatic composition,
 * space for overlay text, high-contrast).
 *
 * Stored as an Asset of type=image with metadataJson.kind="cover" so the
 * editor can render it in the media panel. Old covers are soft-kept in DB
 * for history — the UI picks the most recent one.
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);

    const project = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id },
      include: {
        scenes: { orderBy: { order: "asc" }, take: 5 }
      }
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const userPromptOverride: string | undefined = body.prompt;

    // Compose the thumbnail prompt from project + hook + scene hints.
    const sceneVisuals = project.scenes
      .slice(0, 3)
      .map((s) => s.visualDescription)
      .filter(Boolean)
      .join(" / ");

    const projectStyle = (project as { imageStylePrompt?: string }).imageStylePrompt ?? "";
    const defaultPrompt = [
      `A viral YouTube thumbnail for a video titled "${project.title}".`,
      project.hookText
        ? `Core hook headline: "${project.hookText}".`
        : "",
      `Genre / topic: ${project.genre}.`,
      sceneVisuals
        ? `Visual world: ${sceneVisuals}.`
        : "",
      projectStyle ? `Master style: ${projectStyle}.` : "",
      "Composition: dramatic, high-contrast, cinematic lighting, strong focal subject.",
      "Leave clear negative space in the upper third for large overlay title text.",
      "Emotional, attention-grabbing, optimized for mobile click-through.",
      project.aspectRatio === "9:16"
        ? "Vertical 9:16 aspect."
        : "Horizontal 16:9 aspect."
    ]
      .filter(Boolean)
      .join(" ");

    const prompt = userPromptOverride?.trim() || defaultPrompt;

    const gemini = new GeminiService(keys.geminiApiKey, keys.geminiImageModel);
    const generated = await gemini.generateImageToFile({
      prompt,
      projectId: params.projectId,
      sceneNumber: 0 // 0 reserved for cover
    });

    // Re-file the cover into a /covers subfolder with a stable name, and push
    // to storage separately so we don't clash with scene-0 images.
    const coverDir = path.join(env.mediaRoot, params.projectId, "covers");
    await fs.mkdir(coverDir, { recursive: true });
    const ext = path.extname(generated.localPath) || ".png";
    const coverLocal = path.join(coverDir, `cover-${randomUUID()}${ext}`);
    await fs.copyFile(generated.localPath, coverLocal);

    const coverStoragePath = `projects/${params.projectId}/covers/${path.basename(coverLocal)}`;
    const coverBuffer = await fs.readFile(coverLocal);
    await uploadBuffer({
      path: coverStoragePath,
      buffer: coverBuffer,
      contentType: ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png"
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "image",
        provider: "gemini",
        localPath: coverLocal,
        url: coverStoragePath,
        metadataJson: {
          kind: "cover",
          promptUsed: prompt
        }
      }
    });

    return NextResponse.json({
      assetId: asset.id,
      previewUrl: `/api/assets/${asset.id}`,
      promptUsed: prompt
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[cover-generate] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cover generation failed" },
      { status: 500 }
    );
  }
}
