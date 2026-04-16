import fs from "node:fs/promises";
import path from "node:path";
import { getEnv } from "@/lib/env";
import type { SubtitleChunk } from "@/types";

function toSrtTime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const milliseconds = Math.round((seconds - Math.floor(seconds)) * 1000);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")},${milliseconds.toString().padStart(3, "0")}`;
}

export class SubtitleService {
  private env = getEnv();

  toSrt(chunks: SubtitleChunk[]) {
    return chunks
      .map(
        (chunk) =>
          `${chunk.index}\n${toSrtTime(chunk.startSec)} --> ${toSrtTime(chunk.endSec)}\n${chunk.text}\n`
      )
      .join("\n");
  }

  async persistSrt(projectId: string, chunks: SubtitleChunk[]) {
    const outputDir = path.join(this.env.mediaRoot, projectId, "subtitles");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, "subtitles.srt");
    await fs.writeFile(outputPath, this.toSrt(chunks), "utf8");
    return outputPath;
  }
}
