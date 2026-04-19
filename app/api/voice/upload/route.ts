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
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    case ".m4a":
      return "audio/mp4";
    default:
      return "application/octet-stream";
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const projectId = formData.get("projectId");
    const sourceType = formData.get("sourceType");
    const file = formData.get("file");

    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    if (
      !file ||
      typeof file === "string" ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
    ) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }
    const fileName = (file as { name?: string }).name ?? "audio.mp3";

    const ownedProject = await db.project.findFirst({
      where: { id: projectId, userId: user.id }
    });
    if (!ownedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const extension = path.extname(fileName) || (sourceType === "recorded" ? ".webm" : ".mp3");
    const outputDir = path.join(env.mediaRoot, projectId, "audio");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${sourceType ?? "uploaded"}-${randomUUID()}${extension}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(outputPath, bytes);

    const storagePath = `projects/${projectId}/audio/${path.basename(outputPath)}`;
    await uploadBuffer({
      path: storagePath,
      buffer: bytes,
      contentType: audioMimeFromExtension(extension)
    });

    const sourceTypeStr = typeof sourceType === "string" ? sourceType : "uploaded";
    const asset = await db.asset.create({
      data: {
        projectId,
        type: "audio",
        provider: sourceTypeStr === "recorded" ? "browser-media-recorder" : "manual-upload",
        localPath: outputPath,
        url: storagePath,
        metadataJson: {
          sourceType: sourceTypeStr,
          originalName: fileName
        }
      }
    });

    await db.project.update({
      where: { id: projectId },
      data: {
        narrationSourceType: sourceType === "recorded" ? "recorded" : "uploaded",
        status: "ready_to_render"
      }
    });

    return NextResponse.json({ assetId: asset.id, localPath: outputPath });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audio upload failed" },
      { status: 500 }
    );
  }
}
