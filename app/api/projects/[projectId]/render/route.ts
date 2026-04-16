import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { GeminiService, SubtitleService, VideoRenderService } from "@/lib/services";
import type { SubtitleChunk } from "@/types";

const subtitleService = new SubtitleService();
const videoRenderService = new VideoRenderService();
const geminiService = new GeminiService();
const env = getEnv();

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
    const body = await request.json().catch(() => ({}));
    const project = await db.project.findUnique({
      where: { id: params.projectId },
      include: {
        scenes: {
          orderBy: {
            order: "asc"
          }
        },
        assets: {
          orderBy: {
            createdAt: "desc"
          }
        }
      }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const audioAsset = project.assets.find((asset) => asset.type === "audio" && asset.localPath);
    if (!audioAsset?.localPath) {
      return NextResponse.json({ error: "No narration audio found for this project" }, { status: 400 });
    }

    const scenes = project.scenes.map((scene) => {
      const imageAsset = project.assets.find(
        (asset) => asset.type === "image" && asset.sceneId === scene.id && asset.localPath
      );

      return {
        sceneNumber: scene.order,
        narration: scene.narrationText,
        subtitle: scene.subtitleText,
        visualDescription: scene.visualDescription,
        imagePrompt: scene.imagePrompt,
        durationSec: scene.durationSec,
        imageUrl: imageAsset?.localPath ?? null
      };
    });

    if (!scenes.length || scenes.some((scene) => !scene.imageUrl)) {
      return NextResponse.json(
        { error: "Every scene needs an uploaded or generated image before rendering" },
        { status: 400 }
      );
    }

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "rendering" }
    });

    const audioDurationSec = await getMediaDurationInSeconds(audioAsset.localPath);
    const currentSceneTotal = scenes.reduce((sum, scene) => sum + scene.durationSec, 0);
    const durationScale = currentSceneTotal > 0 ? audioDurationSec / currentSceneTotal : 1;
    const scaledScenes = scenes.map((scene) => ({
      ...scene,
      durationSec: Math.max(1, scene.durationSec * durationScale)
    }));

    let subtitles: SubtitleChunk[];
    try {
      subtitles = await geminiService.transcribeAudioToSubtitleChunks(audioAsset.localPath);
    } catch (error) {
      console.warn("[render] Gemini subtitle timing failed; falling back to scene-based subtitle timing.", error);
      let elapsed = 0;
      subtitles = scaledScenes.map((scene, index) => {
        const startSec = elapsed;
        elapsed += scene.durationSec;
        return {
          index: index + 1,
          startSec,
          endSec: elapsed,
          text: scene.subtitle
        };
      });
    }

    let subtitleAssetId: string | null = null;
    let subtitleUrl: string | null = null;
    const shouldGenerateSrt = body.generateSrt !== false;
    let subtitlesPath = "";

    if (shouldGenerateSrt) {
      subtitlesPath = await subtitleService.persistSrt(params.projectId, subtitles);
      const subtitleAsset = await db.asset.create({
        data: {
          projectId: params.projectId,
          type: "subtitle",
          provider: "gemini-transcription",
          localPath: subtitlesPath,
          url: subtitlesPath,
          metadataJson: {
            format: "srt"
          }
        }
      });
      subtitleAssetId = subtitleAsset.id;
      subtitleUrl = `/api/assets/${subtitleAsset.id}`;
    }

    const outputPath = await videoRenderService.renderProject({
      projectId: params.projectId,
      aspectRatio: (body.aspectRatio ?? project.aspectRatio) as "16:9" | "9:16",
      scenes: scaledScenes,
      narrationAudioPath: audioAsset.localPath,
      subtitlesPath,
      includeSubtitles: body.includeSubtitles !== false
    });

    const videoAsset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "video",
        provider: "ffmpeg",
        localPath: outputPath,
        url: outputPath,
        metadataJson: {
          aspectRatio: body.aspectRatio ?? project.aspectRatio
        }
      }
    });

    await db.renderJob.create({
      data: {
        projectId: params.projectId,
        status: "completed",
        progress: 100,
        outputPath,
        outputUrl: `/api/assets/${videoAsset.id}`
      }
    });

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "completed" }
    });

    return NextResponse.json({
      outputPath,
      videoAssetId: videoAsset.id,
      videoUrl: `/api/assets/${videoAsset.id}`,
      subtitlesPath,
      subtitleAssetId,
      subtitleUrl
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Render failed" },
      { status: 500 }
    );
  }
}
