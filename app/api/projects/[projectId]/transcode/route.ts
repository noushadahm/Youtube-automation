import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { downloadToLocal, uploadLocalFile, isStoragePath } from "@/lib/storage";

const env = getEnv();

/**
 * Transcode an existing rendered MP4 into a different resolution variant.
 * Used by the UI's "Download as …" dropdown so users can grab 360p / 720p /
 * 1080p without re-rendering the whole pipeline.
 *
 * Body: { assetId: string, height: 360 | 720 | 1080 }
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const assetId = String(body.assetId ?? "");
    const height = Number(body.height ?? 720);
    const allowed = new Set([360, 480, 720, 1080]);
    if (!assetId || !allowed.has(height)) {
      return NextResponse.json(
        { error: "assetId + height (one of 360/480/720/1080) required" },
        { status: 400 }
      );
    }

    const source = await db.asset.findFirst({
      where: { id: assetId, projectId: params.projectId, type: "video" },
      include: { project: { select: { userId: true } } }
    });
    if (!source || source.project.userId !== user.id) {
      return NextResponse.json({ error: "Source video not found" }, { status: 404 });
    }

    // Skip if we've already produced this variant.
    const existing = await db.asset.findFirst({
      where: {
        projectId: params.projectId,
        type: "video",
        metadataJson: {
          path: ["variantOf"],
          equals: source.id
        }
      }
    });
    if (
      existing &&
      (existing.metadataJson as { height?: number } | null)?.height === height
    ) {
      return NextResponse.json({
        assetId: existing.id,
        downloadUrl: `/api/assets/${existing.id}?download=1`,
        cached: true
      });
    }

    // Ensure the source is available locally.
    let sourceLocalPath = source.localPath;
    if (!sourceLocalPath || !(await fileExists(sourceLocalPath))) {
      if (source.url && isStoragePath(source.url)) {
        const dest = path.join(
          env.mediaRoot,
          params.projectId,
          "renders",
          path.basename(source.url)
        );
        sourceLocalPath = await downloadToLocal(source.url, dest);
      } else {
        return NextResponse.json({ error: "Source not available" }, { status: 500 });
      }
    }

    const outDir = path.join(env.mediaRoot, params.projectId, "variants");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(
      outDir,
      `${height}p-${randomUUID().slice(0, 6)}.mp4`
    );

    // `-2` keeps the other dimension divisible by 2 (libx264 requirement)
    // while preserving aspect ratio.
    const args = [
      "-y",
      "-i",
      sourceLocalPath,
      "-vf",
      `scale=-2:${height}`,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      height >= 1080 ? "20" : height >= 720 ? "22" : "24",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outPath
    ];

    await runFfmpeg(args);

    const storagePath = `projects/${params.projectId}/variants/${path.basename(outPath)}`;
    await uploadLocalFile({
      localPath: outPath,
      objectPath: storagePath,
      contentType: "video/mp4"
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "video",
        provider: "ffmpeg-transcode",
        localPath: outPath,
        url: storagePath,
        metadataJson: {
          kind: "variant",
          variantOf: source.id,
          height,
          label: `${height}p`
        }
      }
    });

    return NextResponse.json({
      assetId: asset.id,
      downloadUrl: `/api/assets/${asset.id}?download=1`,
      cached: false
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[transcode] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Transcode failed" },
      { status: 500 }
    );
  }
}

async function fileExists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(env.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.slice(-1500) || `ffmpeg exit ${code}`));
      resolve();
    });
  });
}
