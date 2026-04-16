import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";

const env = getEnv();

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const projectId = formData.get("projectId");
    const sourceType = formData.get("sourceType");
    const file = formData.get("file");

    if (typeof projectId !== "string" || !projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    const extension = path.extname(file.name) || (sourceType === "recorded" ? ".webm" : ".mp3");
    const outputDir = path.join(env.mediaRoot, projectId, "audio");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `${sourceType ?? "uploaded"}-${randomUUID()}${extension}`);
    const bytes = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(outputPath, bytes);

    const asset = await db.asset.create({
      data: {
        projectId,
        type: "audio",
        provider: sourceType === "recorded" ? "browser-media-recorder" : "manual-upload",
        localPath: outputPath,
        url: outputPath,
        metadataJson: {
          sourceType: sourceType ?? "uploaded",
          originalName: file.name
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audio upload failed" },
      { status: 500 }
    );
  }
}
