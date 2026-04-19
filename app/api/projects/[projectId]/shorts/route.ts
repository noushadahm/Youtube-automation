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
 * Generate N short-form clips from the latest full-length render.
 *
 * For each short:
 *   1. Pick a time window aligned to scene boundaries (~durationSec long)
 *   2. Use FFmpeg to extract + center-crop to 9:16
 *   3. Upload to Supabase Storage and register as an Asset(type=video, kind=short)
 *
 * Body: { count?: number, durationSec?: number }  (default 3, 60s)
 *
 * Strategy for window selection:
 *   - Window 1: the hook — scenes from the start until sum(dur) ≈ targetSec
 *   - Window 2..N-1: evenly spaced middles
 *   - Window N: the tail — last scenes totalling ~targetSec (closes on CTA)
 *
 * All windows snap to scene boundaries so we never cut a narration mid-sentence.
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const requestedCount = Math.max(1, Math.min(10, Number(body.count ?? 3)));
    const targetSec = Math.max(15, Math.min(90, Number(body.durationSec ?? 60)));

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

    // Pick the most recent full-render MP4 (exclude scene-clips and shorts).
    const longRender = project.assets.find(
      (a) =>
        a.type === "video" &&
        ((a.metadataJson as { kind?: string } | null)?.kind ?? "final") !== "scene-clip" &&
        ((a.metadataJson as { kind?: string } | null)?.kind ?? "final") !== "short"
    );
    if (!longRender) {
      return NextResponse.json(
        { error: "No rendered video yet. Export the MP4 first, then generate shorts." },
        { status: 400 }
      );
    }

    // Compute scene timeline (start/end for each scene).
    const timeline: Array<{ order: number; startSec: number; endSec: number }> = [];
    {
      let cursor = 0;
      for (const s of project.scenes) {
        const startSec = cursor;
        cursor += s.durationSec;
        timeline.push({ order: s.order, startSec, endSec: cursor });
      }
    }
    const totalSec = timeline.at(-1)?.endSec ?? 0;
    if (totalSec < targetSec + 1) {
      return NextResponse.json(
        { error: "The rendered video is too short for the requested clip length." },
        { status: 400 }
      );
    }

    /**
     * Build a window around a desired centre (in seconds). Snaps to scene
     * boundaries. Returns { start, end, label } or null if it can't fit.
     */
    function windowFromAnchor(anchorSec: number): { start: number; end: number } | null {
      // Find scenes overlapping the desired window.
      let start = Math.max(0, anchorSec - targetSec / 2);
      let end = Math.min(totalSec, start + targetSec);
      if (end - start < targetSec) start = Math.max(0, end - targetSec);

      // Snap start UP to the nearest scene boundary at or before `start`.
      const startScene = timeline.find((s) => s.startSec <= start && start < s.endSec);
      if (startScene) start = startScene.startSec;

      // Extend end to the next scene boundary that keeps us ≈ targetSec.
      let acc = 0;
      let snappedEnd = start;
      for (const s of timeline) {
        if (s.endSec <= start) continue;
        const chunk = Math.min(s.endSec, start + targetSec) - Math.max(s.startSec, start);
        if (chunk <= 0) break;
        acc += chunk;
        snappedEnd = s.endSec;
        if (acc >= targetSec) break;
      }
      end = Math.min(totalSec, snappedEnd);
      if (end - start < 3) return null; // too small to be useful
      return { start, end };
    }

    // Anchors spread across the video.
    const anchors: number[] = [];
    if (requestedCount === 1) {
      anchors.push(totalSec / 2);
    } else {
      // First anchor in the opening (hook). Last in the tail (CTA).
      // Middle ones evenly spaced between.
      anchors.push(targetSec / 2);
      for (let i = 1; i < requestedCount - 1; i += 1) {
        const frac = i / (requestedCount - 1);
        anchors.push(frac * totalSec);
      }
      anchors.push(totalSec - targetSec / 2);
    }

    // Dedupe windows that overlap heavily.
    const windows: Array<{ start: number; end: number; label: string }> = [];
    for (const a of anchors) {
      const w = windowFromAnchor(a);
      if (!w) continue;
      const overlaps = windows.some(
        (existing) => w.start < existing.end && w.end > existing.start
      );
      if (overlaps) continue;
      windows.push({
        ...w,
        label:
          windows.length === 0
            ? "Hook"
            : windows.length === requestedCount - 1
              ? "CTA"
              : `Part ${windows.length + 1}`
      });
    }
    if (windows.length === 0) {
      return NextResponse.json(
        { error: "Couldn't fit any windows — try a shorter duration." },
        { status: 400 }
      );
    }

    // Ensure the long render is locally available.
    let longLocalPath = longRender.localPath;
    if (!longLocalPath || !(await fileExists(longLocalPath))) {
      if (longRender.url && isStoragePath(longRender.url)) {
        const dest = path.join(
          env.mediaRoot,
          params.projectId,
          "renders",
          path.basename(longRender.url)
        );
        longLocalPath = await downloadToLocal(longRender.url, dest);
      } else {
        return NextResponse.json(
          { error: "Full render not available on disk or storage." },
          { status: 500 }
        );
      }
    }

    // Shorts output dir.
    const shortsDir = path.join(env.mediaRoot, params.projectId, "shorts");
    await fs.mkdir(shortsDir, { recursive: true });

    const created: Array<{ assetId: string; startSec: number; endSec: number; label: string }> = [];

    for (const w of windows) {
      const outPath = path.join(shortsDir, `short-${Math.round(w.start)}-${Math.round(w.end)}-${randomUUID().slice(0, 6)}.mp4`);

      // Crop 16:9 (or the source) to vertical 9:16 centred on the middle.
      // Also up-scales to 1080x1920 for YouTube Shorts / Reels quality.
      // We use fast seek (`-ss` before -i) for speed; for frame-accurate cutting
      // the slight precision loss is acceptable for these social clips.
      const args = [
        "-y",
        "-ss",
        String(w.start),
        "-i",
        longLocalPath,
        "-t",
        String(Math.max(1, w.end - w.start)),
        "-vf",
        "scale=-2:1920,crop=1080:1920",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "22",
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

      // Upload to Storage.
      const storagePath = `projects/${params.projectId}/shorts/${path.basename(outPath)}`;
      await uploadLocalFile({
        localPath: outPath,
        objectPath: storagePath,
        contentType: "video/mp4"
      });

      const asset = await db.asset.create({
        data: {
          projectId: params.projectId,
          type: "video",
          provider: "ffmpeg",
          localPath: outPath,
          url: storagePath,
          metadataJson: {
            kind: "short",
            label: w.label,
            startSec: w.start,
            endSec: w.end,
            durationSec: w.end - w.start,
            sourceVideoAssetId: longRender.id
          }
        }
      });

      created.push({
        assetId: asset.id,
        startSec: w.start,
        endSec: w.end,
        label: w.label
      });
    }

    return NextResponse.json({ shorts: created });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[shorts-generate] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Shorts generation failed" },
      { status: 500 }
    );
  }
}

async function fileExists(p: string): Promise<boolean> {
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
    child.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr.slice(-1500) || `FFmpeg exit ${code}`));
      resolve();
    });
  });
}
