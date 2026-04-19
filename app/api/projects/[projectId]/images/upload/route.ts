import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { ProjectService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { uploadBuffer } from "@/lib/storage";

const env = getEnv();
const projectService = new ProjectService();

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

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const ownedProject = await db.project.findFirst({
      where: { id: params.projectId, userId: user.id }
    });
    if (!ownedProject) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const sceneId = formData.get("sceneId");
    const file = formData.get("file");

    if (typeof sceneId !== "string" || !sceneId) {
      return NextResponse.json({ error: "sceneId is required" }, { status: 400 });
    }

    // Node 18 doesn't have `File` as a global; duck-type the upload instead.
    if (
      !file ||
      typeof file === "string" ||
      typeof (file as { arrayBuffer?: unknown }).arrayBuffer !== "function"
    ) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }
    const fileName = (file as { name?: string }).name ?? "upload.png";

    const scene = await db.scene.findFirst({
      where: {
        id: sceneId,
        projectId: params.projectId
      }
    });

    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const extension = path.extname(fileName) || ".png";
    const outputDir = path.join(env.mediaRoot, params.projectId, "images");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `scene-${scene.order}-manual-${randomUUID()}${extension}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(outputPath, bytes);

    const storagePath = `projects/${params.projectId}/images/${path.basename(outputPath)}`;
    await uploadBuffer({
      path: storagePath,
      buffer: bytes,
      contentType: imageMimeFromExtension(extension)
    });

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
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

    const imageUrl = `/api/assets/${asset.id}`;
    await projectService.updateSceneImage(scene.id, imageUrl);

    return NextResponse.json({ assetId: asset.id, imageUrl });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed" },
      { status: 500 }
    );
  }
}
