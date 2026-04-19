import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ImageGenerationService, ProjectService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

const projectService = new ProjectService();

export async function POST(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const imageGenerationService = new ImageGenerationService(
      keys.geminiApiKey,
      keys.geminiImageModel
    );

    const body = await request.json().catch(() => ({}));
    const project = await projectService.getProjectById(params.projectId, user.id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const scenesToGenerate = body.sceneId
      ? project.scenes.filter((scene) => scene.id === body.sceneId)
      : project.scenes;

    if (scenesToGenerate.length === 0) {
      return NextResponse.json(
        { error: "No scenes available to generate images" },
        { status: 400 }
      );
    }

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "generating_images" }
    });

    const results = [];

    const styleSuffix = (project as { imageStylePrompt?: string }).imageStylePrompt ?? "";

    for (const scene of scenesToGenerate) {
      const composedPrompt = styleSuffix
        ? `${scene.imagePrompt}. Style: ${styleSuffix}`
        : scene.imagePrompt;
      const generated = await imageGenerationService.generateAndStoreImage({
        projectId: params.projectId,
        sceneNumber: scene.order,
        prompt: composedPrompt
      });

      const asset = await db.asset.create({
        data: {
          projectId: params.projectId,
          sceneId: scene.id,
          type: "image",
          provider: "gemini",
          localPath: generated.localPath,
          // `generated.url` is now the Supabase Storage object path.
          url: generated.url
        }
      });

      const sceneUrl = `/api/assets/${asset.id}`;
      await projectService.updateSceneImage(scene.id, sceneUrl);
      results.push({ sceneId: scene.id, assetId: asset.id, imageUrl: sceneUrl });
    }

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "ready_to_render" }
    });

    return NextResponse.json({ results });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[image-generate] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
