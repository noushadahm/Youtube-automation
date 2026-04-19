import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { uploadBuffer } from "@/lib/storage";

const env = getEnv();

function imageMimeFromExtension(ext: string) {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

/**
 * Create a new Scene from an uploaded image file. Appends at the end of the
 * scene list by default, or inserts at `order` if provided (other scenes get
 * pushed back by 1).
 *
 * Body: multipart form with:
 *   - file       (required)   the image
 *   - order?     (optional)   1-based position to insert at
 *   - duration?  (optional)   seconds, default 4
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();

    const project = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id },
      include: { scenes: { orderBy: { order: "asc" } } }
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    // Node 18 doesn't have `File` as a global, so we duck-type a Blob-like
    // upload instead of using `instanceof File` (which throws ReferenceError
    // on Node 18).
    if (
      !file ||
      typeof file === "string" ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
    ) {
      return NextResponse.json({ error: "Image file required" }, { status: 400 });
    }
    const fileName = (file as { name?: string }).name ?? "upload.png";
    const duration = Math.max(0.5, Number(form.get("duration") ?? 4));
    const requestedOrder = Number(form.get("order"));
    const orderToUse =
      Number.isFinite(requestedOrder) && requestedOrder > 0 && requestedOrder <= project.scenes.length + 1
        ? Math.round(requestedOrder)
        : project.scenes.length + 1;

    // Save the image locally, push to Supabase Storage.
    const extension = path.extname(fileName) || ".png";
    const outputDir = path.join(env.mediaRoot, project.id, "images");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `scene-upload-${randomUUID()}${extension}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(outputPath, bytes);

    const storagePath = `projects/${project.id}/images/${path.basename(outputPath)}`;
    await uploadBuffer({
      path: storagePath,
      buffer: bytes,
      contentType: imageMimeFromExtension(extension)
    });

    // Insert scene at the requested order, pushing later scenes back.
    const result = await db.$transaction(async (tx) => {
      await tx.scene.updateMany({
        where: { projectId: project.id, order: { gte: orderToUse } },
        data: { order: { increment: 1 } }
      });

      const scene = await tx.scene.create({
        data: {
          projectId: project.id,
          order: orderToUse,
          narrationText: "",
          subtitleText: "",
          visualDescription: "",
          imagePrompt: "",
          durationSec: duration,
          cameraMotion: "zoomIn",
          transition: "fade"
        }
      });

      const asset = await tx.asset.create({
        data: {
          projectId: project.id,
          sceneId: scene.id,
          type: "image",
          provider: "manual-upload",
          localPath: outputPath,
          url: storagePath,
          metadataJson: {
            sourceType: "uploaded",
            originalName: fileName
          }
        }
      });

      const updated = await tx.scene.update({
        where: { id: scene.id },
        data: { imageUrl: `/api/assets/${asset.id}` }
      });

      return { scene: updated, assetId: asset.id };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[scenes/from-image] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add scene" },
      { status: 500 }
    );
  }
}
