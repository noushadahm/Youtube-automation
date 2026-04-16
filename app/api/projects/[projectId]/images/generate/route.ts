import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ImageGenerationService, ProjectService } from "@/lib/services";

const projectService = new ProjectService();
const imageGenerationService = new ImageGenerationService();

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const project = await projectService.getProjectById(params.projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const scenesToGenerate = body.sceneId
      ? project.scenes.filter((scene) => scene.id === body.sceneId)
      : project.scenes;

    if (scenesToGenerate.length === 0) {
      return NextResponse.json({ error: "No scenes available to generate images" }, { status: 400 });
    }

    await db.project.update({
      where: { id: params.projectId },
      data: {
        status: "generating_images"
      }
    });

    const results = [];

    for (const scene of scenesToGenerate) {
      const generated = await imageGenerationService.generateAndStoreImage({
        projectId: params.projectId,
        sceneNumber: scene.order,
        prompt: scene.imagePrompt
      });

      const asset = await db.asset.create({
        data: {
          projectId: params.projectId,
          sceneId: scene.id,
          type: "image",
          provider: "openai",
          localPath: generated.localPath,
          url: generated.url
        }
      });

      const sceneUrl = `/api/assets/${asset.id}`;
      await projectService.updateSceneImage(scene.id, sceneUrl);
      results.push({ sceneId: scene.id, assetId: asset.id, imageUrl: sceneUrl });
    }

    await db.project.update({
      where: { id: params.projectId },
      data: {
        status: "ready_to_render"
      }
    });

    return NextResponse.json({ results });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
