import { NextResponse } from "next/server";
import { SubtitleService, VideoRenderService } from "@/lib/services";
import type { SubtitleChunk } from "@/types";

const subtitleService = new SubtitleService();
const videoRenderService = new VideoRenderService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const subtitlesPath = await subtitleService.persistSrt(body.projectId, body.subtitles as SubtitleChunk[]);
    const outputPath = await videoRenderService.renderProject({
      projectId: body.projectId,
      aspectRatio: body.aspectRatio,
      scenes: body.scenes,
      narrationAudioPath: body.narrationAudioPath,
      musicPath: body.backgroundMusicPath ?? null,
      subtitlesPath
    });

    return NextResponse.json({ outputPath, subtitlesPath });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Render failed" },
      { status: 500 }
    );
  }
}
