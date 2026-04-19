import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GeminiService, SubtitleService } from "@/lib/services";
import type { SubtitleChunk } from "@/types";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

const subtitleService = new SubtitleService();

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const geminiService = new GeminiService(keys.geminiApiKey);

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
      return NextResponse.json(
        { error: "No narration audio found for this project" },
        { status: 400 }
      );
    }

    let subtitles: SubtitleChunk[];
    try {
      subtitles = await geminiService.transcribeAudioToSubtitleChunks(audioAsset.localPath);
    } catch (error) {
      console.warn(
        "[subtitles] Gemini subtitle timing failed; falling back to scene timing.",
        error
      );
      let elapsed = 0;
      subtitles = project.scenes.map((scene, index) => {
        const startSec = elapsed;
        elapsed += scene.durationSec;
        return {
          index: index + 1,
          startSec,
          endSec: elapsed,
          text: scene.subtitleText
        };
      });
    }

    const subtitlesPath = await subtitleService.persistSrt(params.projectId, subtitles);
    const subtitleAsset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "subtitle",
        provider: "gemini-transcription",
        localPath: subtitlesPath,
        url: subtitlesPath,
        metadataJson: { format: "srt" }
      }
    });

    return NextResponse.json({
      subtitleAssetId: subtitleAsset.id,
      subtitleUrl: `/api/assets/${subtitleAsset.id}`,
      subtitlesPath
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Subtitle generation failed" },
      { status: 500 }
    );
  }
}
