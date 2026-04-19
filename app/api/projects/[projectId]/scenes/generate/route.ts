import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ProjectService, SceneService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

const projectService = new ProjectService();

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const sceneService = new SceneService(keys.geminiApiKey);

    const project = await projectService.getProjectById(params.projectId, user.id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.script.trim()) {
      return NextResponse.json({ error: "Project script is empty" }, { status: 400 });
    }

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "generating_scenes" }
    });

    const result = await sceneService.planScenes({
      title: project.title,
      story: project.script,
      targetDurationSec: project.targetDurationSec,
      genre: project.genre,
      language: project.language,
      styleSuffix:
        "maintain consistent character design, cinematic lighting, cohesive world-building, polished storybook realism"
    });

    const scenes = await projectService.replaceScenes(params.projectId, result.scenes);

    await db.project.update({
      where: { id: params.projectId },
      data: { status: "ready_to_render" }
    });

    return NextResponse.json({ scenes });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scene generation failed" },
      { status: 500 }
    );
  }
}
