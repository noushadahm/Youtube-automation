import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { AiVideoService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";
import { isStoragePath, uploadBuffer } from "@/lib/storage";

const env = getEnv();

/**
 * Generate an AI video clip for a single scene from its still image using
 * Google Veo (via the user's Gemini API key). Stores the clip as an Asset of
 * type=video linked to the scene, so the render pipeline will pick it up
 * automatically in place of the still.
 */
export async function POST(
  _request: Request,
  { params }: { params: { projectId: string; sceneId: string } }
) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);

    const scene = await db.scene.findFirst({
      where: { id: params.sceneId, projectId: params.projectId },
      include: {
        assets: { where: { type: "image" }, orderBy: { createdAt: "desc" }, take: 1 },
        project: { select: { userId: true, aspectRatio: true, imageStylePrompt: true } }
      }
    });

    if (!scene || scene.project.userId !== user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const imageAsset = scene.assets[0];
    if (!imageAsset?.url || !isStoragePath(imageAsset.url)) {
      return NextResponse.json(
        { error: "This scene needs a generated/uploaded image first." },
        { status: 400 }
      );
    }

    const svc = new AiVideoService(keys.geminiApiKey, (keys as { geminiVideoModel?: string }).geminiVideoModel);
    const style = scene.project.imageStylePrompt?.trim() ?? "";
    const motionPrompt = `${scene.imagePrompt}. ${style ? `Master style: ${style}. ` : ""}Subtle cinematic camera motion with natural parallax; preserve character and environment exactly.`;
    const result = await svc.generateClip({
      imageStoragePath: imageAsset.url,
      prompt: motionPrompt,
      durationSec: Math.max(5, Math.min(8, scene.durationSec)),
      aspectRatio: (scene.project.aspectRatio as "16:9" | "9:16") ?? "16:9"
    });

    // Write to local disk (for fast render access) and push to Storage.
    const localDir = path.join(env.mediaRoot, params.projectId, "ai-clips");
    await fs.mkdir(localDir, { recursive: true });
    const localFile = path.join(localDir, `scene-${scene.order}-${randomUUID()}.mp4`);
    await fs.writeFile(localFile, result.videoBuffer);

    const storagePath = `projects/${params.projectId}/ai-clips/${path.basename(localFile)}`;
    await uploadBuffer({
      path: storagePath,
      buffer: result.videoBuffer,
      contentType: result.contentType
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        sceneId: scene.id,
        type: "video",
        provider: `veo:${result.model}`,
        localPath: localFile,
        url: storagePath,
        metadataJson: {
          kind: "scene-clip",
          sceneOrder: scene.order,
          sourceImage: imageAsset.id
        }
      }
    });

    return NextResponse.json({
      assetId: asset.id,
      previewUrl: `/api/assets/${asset.id}`,
      model: result.model
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[ai-video] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "AI video generation failed" },
      { status: 500 }
    );
  }
}
