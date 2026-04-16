import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { ProjectService } from "@/lib/services";

const env = getEnv();
const projectService = new ProjectService();

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const formData = await request.formData();
    const sceneId = formData.get("sceneId");
    const file = formData.get("file");

    if (typeof sceneId !== "string" || !sceneId) {
      return NextResponse.json({ error: "sceneId is required" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }

    const scene = await db.scene.findFirst({
      where: {
        id: sceneId,
        projectId: params.projectId
      }
    });

    if (!scene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const extension = path.extname(file.name) || ".png";
    const outputDir = path.join(env.mediaRoot, params.projectId, "images");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `scene-${scene.order}-manual-${randomUUID()}${extension}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(outputPath, bytes);

    const asset = await db.asset.create({
      data: {
        projectId: params.projectId,
        sceneId: scene.id,
        type: "image",
        provider: "manual-upload",
        localPath: outputPath,
        url: outputPath,
        metadataJson: {
          sourceType: "uploaded",
          originalName: file.name
        }
      }
    });

    const imageUrl = `/api/assets/${asset.id}`;
    await projectService.updateSceneImage(scene.id, imageUrl);

    return NextResponse.json({ assetId: asset.id, imageUrl });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image upload failed" },
      { status: 500 }
    );
  }
}
