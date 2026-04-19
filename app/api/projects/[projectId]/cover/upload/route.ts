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
 * Upload a custom cover image from the user's local device.
 * Saved as an Asset(type=image, kind=cover) — same shape as an AI-generated
 * cover, so the rest of the editor picks it up automatically (intro clip,
 * media panel thumbnail, download button, etc.).
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const owned = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id }
    });
    if (!owned) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (
      !file ||
      typeof file === "string" ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
    ) {
      return NextResponse.json({ error: "Cover image file required" }, { status: 400 });
    }
    const fileName = (file as { name?: string }).name ?? "cover.png";
    const bytes = Buffer.from(await (file as Blob).arrayBuffer());

    const ext = path.extname(fileName) || ".png";
    const coverDir = path.join(env.mediaRoot, params.projectId, "covers");
    await fs.mkdir(coverDir, { recursive: true });
    const localPath = path.join(coverDir, `cover-upload-${randomUUID()}${ext}`);
    await fs.writeFile(localPath, bytes);

    const storagePath = `projects/${params.projectId}/covers/${path.basename(localPath)}`;
    await uploadBuffer({
      path: storagePath,
      buffer: bytes,
      contentType: imageMimeFromExtension(ext)
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "image",
        provider: "manual-upload",
        localPath,
        url: storagePath,
        metadataJson: {
          kind: "cover",
          sourceType: "uploaded",
          originalName: fileName
        }
      }
    });

    return NextResponse.json({
      assetId: asset.id,
      previewUrl: `/api/assets/${asset.id}`
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[cover-upload] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cover upload failed" },
      { status: 500 }
    );
  }
}
