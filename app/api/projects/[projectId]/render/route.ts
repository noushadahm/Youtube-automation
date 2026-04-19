import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { enqueueRender } from "@/lib/queue";

/**
 * Enqueue a video render and return a renderJobId. The actual FFmpeg work
 * runs in the worker process (`npm run worker`). Clients should poll
 * GET /api/render-jobs/:id for status + progress.
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));

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

    // Prerequisite checks, so we fail fast instead of in the worker.
    const audioAsset = project.assets.find((a) => a.type === "audio");
    if (!audioAsset) {
      return NextResponse.json(
        { error: "No narration audio found for this project" },
        { status: 400 }
      );
    }
    const everySceneHasImage = project.scenes.every((scene) =>
      project.assets.some((a) => a.type === "image" && a.sceneId === scene.id)
    );
    if (!everySceneHasImage) {
      return NextResponse.json(
        { error: "Every scene needs an uploaded or generated image before rendering" },
        { status: 400 }
      );
    }

    const renderJob = await db.renderJob.create({
      data: {
        projectId: params.projectId,
        status: "queued",
        progress: 0
      }
    });

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "rendering" }
    });

    await enqueueRender({
      renderJobId: renderJob.id,
      projectId: params.projectId,
      userId: user.id,
      aspectRatio: (body.aspectRatio ?? project.aspectRatio) as "16:9" | "9:16",
      includeSubtitles: body.includeSubtitles !== false,
      generateSrt: body.generateSrt !== false,
      hookText:
        typeof body.hookText === "string" ? body.hookText : project.hookText ?? null,
      compressForUpload: Boolean(body.compressForUpload),
      includeCover: body.includeCover !== false, // default ON if a cover exists
      coverDurationSec:
        typeof body.coverDurationSec === "number" ? body.coverDurationSec : 3
    });

    return NextResponse.json(
      {
        renderJobId: renderJob.id,
        status: renderJob.status,
        progress: renderJob.progress
      },
      { status: 202 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enqueue render" },
      { status: 500 }
    );
  }
}
