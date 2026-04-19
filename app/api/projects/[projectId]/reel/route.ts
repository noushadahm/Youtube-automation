import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { GeminiService, SubtitleService, VideoRenderService } from "@/lib/services";
import type { SubtitleChunk } from "@/types";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";
import { uploadLocalFile } from "@/lib/storage";

const subtitleService = new SubtitleService();
const videoRenderService = new VideoRenderService();
const env = getEnv();
const REEL_DURATION_SEC = 30;

async function getMediaDurationInSeconds(filePath: string) {
  const ffprobePath = path.join(path.dirname(env.ffmpegPath), "ffprobe");

  return new Promise<number>((resolve, reject) => {
    const child = spawn(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `ffprobe exited with code ${code}`));
        return;
      }
      resolve(Number.parseFloat(stdout.trim()));
    });
  });
}

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const geminiService = new GeminiService(keys.geminiApiKey);

    const body = await request.json().catch(() => ({}));
    const startSec = Math.max(0, Number(body.startSec ?? 0));
    const project = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id },
      include: {
        scenes: { orderBy: { order: "asc" } },
        assets: { orderBy: { createdAt: "desc" } }
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const audioAsset = project.assets.find((asset) => asset.type === "audio" && asset.localPath);
    if (!audioAsset?.localPath) {
      return NextResponse.json({ error: "No narration audio found for this project" }, { status: 400 });
    }

    const audioDurationSec = await getMediaDurationInSeconds(audioAsset.localPath);
    const clipDurationSec = Math.min(REEL_DURATION_SEC, Math.max(1, audioDurationSec - startSec));

    let cursor = 0;
    const timeline = project.scenes.map((scene) => {
      const sceneStart = cursor;
      const sceneEnd = cursor + scene.durationSec;
      cursor = sceneEnd;
      return { scene, sceneStart, sceneEnd };
    });

    const reelScenes = timeline
      .filter(({ sceneEnd, sceneStart }) => sceneEnd > startSec && sceneStart < startSec + clipDurationSec)
      .map(({ scene, sceneStart, sceneEnd }) => {
        const overlapStart = Math.max(sceneStart, startSec);
        const overlapEnd = Math.min(sceneEnd, startSec + clipDurationSec);
        const imageAsset = project.assets.find(
          (asset) => asset.type === "image" && asset.sceneId === scene.id && asset.localPath
        );

        return {
          sceneNumber: scene.order,
          subtitle: scene.subtitleText,
          durationSec: Math.max(1, overlapEnd - overlapStart),
          imagePath: imageAsset?.localPath ?? null,
          videoClipPath: null,
          cameraMotion: (scene.cameraMotion as never) ?? "zoomIn",
          transition: (scene.transition as never) ?? "fade"
        };
      });

    if (!reelScenes.length || reelScenes.some((scene) => !scene.imagePath)) {
      return NextResponse.json(
        { error: "All reel scenes need images before reel generation" },
        { status: 400 }
      );
    }

    let subtitles: SubtitleChunk[] = [];
    try {
      const allSubtitles = await geminiService.transcribeAudioToSubtitleChunks(audioAsset.localPath);
      subtitles = allSubtitles
        .filter((chunk) => chunk.endSec > startSec && chunk.startSec < startSec + clipDurationSec)
        .map((chunk, index) => ({
          index: index + 1,
          startSec: Math.max(0, chunk.startSec - startSec),
          endSec: Math.min(clipDurationSec, chunk.endSec - startSec),
          text: chunk.text
        }));
    } catch {
      let elapsed = 0;
      subtitles = reelScenes.map((scene, index) => {
        const chunk = {
          index: index + 1,
          startSec: elapsed,
          endSec: elapsed + scene.durationSec,
          text: scene.subtitle
        };
        elapsed += scene.durationSec;
        return chunk;
      });
    }

    const subtitlesPath = await subtitleService.persistSrt(params.projectId, subtitles);
    const outputPath = await videoRenderService.renderProject({
      projectId: params.projectId,
      aspectRatio: "9:16",
      scenes: reelScenes,
      narrationAudioPath: audioAsset.localPath!,
      subtitlesPath,
      includeSubtitles: body.includeSubtitles !== false,
      outputFileName: "reel-30s.mp4"
    });

    const reelStoragePath = `projects/${params.projectId}/renders/${path.basename(outputPath)}`;
    await uploadLocalFile({
      localPath: outputPath,
      objectPath: reelStoragePath,
      contentType: "video/mp4"
    });

    const reelAsset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "video",
        provider: "ffmpeg",
        localPath: outputPath,
        url: reelStoragePath,
        metadataJson: {
          kind: "reel",
          durationSec: clipDurationSec,
          startSec
        }
      }
    });

    return NextResponse.json({
      reelAssetId: reelAsset.id,
      reelUrl: `/api/assets/${reelAsset.id}`
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Reel generation failed" },
      { status: 500 }
    );
  }
}
