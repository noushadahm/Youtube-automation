import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getEnv } from "@/lib/env";
import { getResolution, subtitleStyleFilter } from "@/lib/ffmpeg/filters";
import type { AspectRatio, ScenePlan } from "@/types";

function escapeFilterValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/,/g, "\\,").replace(/'/g, "\\'");
}

function escapeDrawtextText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function buildSubtitleDrawtextFilter(scenes: Array<ScenePlan & { imageUrl?: string | null }>) {
  const fontPath = "/System/Library/Fonts/Supplemental/Arial.ttf";
  let currentTime = 0;

  return scenes
    .map((scene) => {
      const start = currentTime;
      const end = currentTime + Math.max(1, scene.durationSec);
      currentTime = end;
      const text = escapeDrawtextText(scene.subtitle || "");

      return `drawtext=fontfile='${escapeFilterValue(fontPath)}':text='${text}':fontcolor=white:fontsize=42:box=1:boxcolor=black@0.55:boxborderw=18:x=(w-text_w)/2:y=h-(text_h*2.8):enable='between(t,${start},${end})'`;
    })
    .join(",");
}

interface RenderInput {
  projectId: string;
  aspectRatio: AspectRatio;
  scenes: Array<ScenePlan & { imageUrl?: string | null }>;
  narrationAudioPath: string;
  subtitlesPath: string;
  includeSubtitles?: boolean;
  audioStartSec?: number;
  audioDurationSec?: number;
  outputFileName?: string;
  backgroundMusicPath?: string;
}

export class VideoRenderService {
  private env = getEnv();

  async renderProject(input: RenderInput) {
    const outputDir = path.resolve(this.env.mediaRoot, input.projectId, "renders");
    await fs.mkdir(outputDir, { recursive: true });

    const concatFilePath = path.join(outputDir, "images.txt");
    const outputPath = path.join(outputDir, input.outputFileName ?? "final.mp4");
    const { width, height } = getResolution(input.aspectRatio);
    const narrationAudioPath = path.resolve(input.narrationAudioPath);
    const subtitlesPath = path.resolve(input.subtitlesPath);
    const subtitleDrawtextFilter = buildSubtitleDrawtextFilter(input.scenes);
    const subtitleFilter = `subtitles=filename='${escapeFilterValue(subtitlesPath)}':force_style='${subtitleStyleFilter()}'`;

    const concatEntries = input.scenes
      .flatMap((scene) => {
        const rawImagePath = scene.imageUrl ?? scene.imagePrompt ?? "";
        const imagePath = path.resolve(rawImagePath).replace(/'/g, "'\\''");
        return [`file '${imagePath}'`, `duration ${Math.max(1, scene.durationSec)}`];
      });

    // FFmpeg concat demuxer ignores the duration of the final entry unless the file
    // is listed one more time. Repeating the last still image keeps the last scene
    // visible for its intended duration.
    const lastScene = input.scenes.at(-1);
    if (lastScene) {
      const lastImagePath = path.resolve(lastScene.imageUrl ?? lastScene.imagePrompt ?? "").replace(/'/g, "'\\''");
      concatEntries.push(`file '${lastImagePath}'`);
    }

    const concatFileContents = concatEntries.join("\n");

    await fs.writeFile(concatFilePath, concatFileContents, "utf8");

    const sharedArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFilePath,
      ...(typeof input.audioStartSec === "number" ? ["-ss", String(input.audioStartSec)] : []),
      ...(typeof input.audioDurationSec === "number" ? ["-t", String(input.audioDurationSec)] : []),
      "-i",
      narrationAudioPath
    ];

    const argsWithSubtitles = [
      ...sharedArgs,
      "-vf",
      `scale=${width}:${height},${subtitleFilter}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-vsync",
      "vfr",
      "-shortest",
      outputPath
    ];

    const argsWithDrawtextSubtitles = [
      ...sharedArgs,
      "-vf",
      `scale=${width}:${height}${subtitleDrawtextFilter ? `,${subtitleDrawtextFilter}` : ""}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-vsync",
      "vfr",
      "-shortest",
      outputPath
    ];

    const argsWithoutSubtitles = [
      ...sharedArgs,
      "-vf",
      `scale=${width}:${height}`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-crf",
      "20",
      "-c:a",
      "aac",
      "-shortest",
      outputPath
    ];

    // Production note: upgrade this single-pass pipeline to a per-scene filter graph
    // for true Ken Burns motion, transition selection, layered music, and watermarking.
    if (input.includeSubtitles === false) {
      await this.runFfmpeg(argsWithoutSubtitles);
      return outputPath;
    }

    try {
      await this.runFfmpeg(argsWithSubtitles);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("No such filter: 'subtitles'") || message.includes("Filter not found")) {
        console.warn("[render] libass subtitles filter unavailable; retrying with drawtext subtitles.");
        try {
          await this.runFfmpeg(argsWithDrawtextSubtitles);
          return outputPath;
        } catch (drawtextError) {
          const drawtextMessage = drawtextError instanceof Error ? drawtextError.message : String(drawtextError);
          if (!drawtextMessage.includes("No such filter: 'drawtext'") && !drawtextMessage.includes("Filter not found")) {
            throw drawtextError;
          }
        }

        console.warn("[render] Subtitle filters unavailable; retrying render without burned subtitles.");
        await this.runFfmpeg(argsWithoutSubtitles);
      } else {
        throw error;
      }
    }
    return outputPath;
  }

  private async runFfmpeg(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.env.ffmpegPath, args, {
        stdio: ["ignore", "pipe", "pipe"]
      });
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        process.stderr.write(chunk);
      });

      child.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `FFmpeg exited with code ${code}`));
          return;
        }

        resolve();
      });
    });
  }
}
