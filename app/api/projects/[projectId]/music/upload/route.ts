import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { uploadBuffer } from "@/lib/storage";

const env = getEnv();

function audioMimeFromExtension(ext: string) {
  switch (ext.toLowerCase()) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "audio/mpeg";
  }
}

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

    const formData = await request.formData();
    const file = formData.get("file");
    const volumeRaw = formData.get("volume");
    if (
      !file ||
      typeof file === "string" ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
    ) {
      return NextResponse.json({ error: "Music file is required" }, { status: 400 });
    }
    const fileName = (file as { name?: string }).name ?? "music.mp3";
    const volume =
      typeof volumeRaw === "string" && !Number.isNaN(Number(volumeRaw))
        ? Math.max(0, Math.min(1, Number(volumeRaw)))
        : 0.25;

    const extension = path.extname(fileName) || ".mp3";
    const outputDir = path.join(env.mediaRoot, params.projectId, "music");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `music-${randomUUID()}${extension}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(outputPath, bytes);

    const storagePath = `projects/${params.projectId}/music/${path.basename(outputPath)}`;
    await uploadBuffer({
      path: storagePath,
      buffer: bytes,
      contentType: audioMimeFromExtension(extension)
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        type: "music",
        provider: "manual-upload",
        localPath: outputPath,
        url: storagePath,
        metadataJson: {
          originalName: fileName,
          volume
        }
      }
    });

    return NextResponse.json({ assetId: asset.id });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Music upload failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const assetId = url.searchParams.get("assetId");
    if (!assetId) {
      return NextResponse.json({ error: "assetId is required" }, { status: 400 });
    }
    const asset = await db.asset.findFirst({
      where: { id: assetId, projectId: params.projectId, type: "music" },
      include: { project: { select: { userId: true } } }
    });
    if (!asset || asset.project.userId !== user.id) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    await db.asset.delete({ where: { id: asset.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove music" },
      { status: 500 }
    );
  }
}
