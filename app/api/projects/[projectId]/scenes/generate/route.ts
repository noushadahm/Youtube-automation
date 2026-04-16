import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ProjectService, SceneService } from "@/lib/services";

const projectService = new ProjectService();
const sceneService = new SceneService();

export async function POST(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const project = await projectService.getProjectById(params.projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    if (!project.script.trim()) {
      return NextResponse.json({ error: "Project script is empty" }, { status: 400 });
    }

    await db.project.update({
      where: { id: params.projectId },
      data: {
        status: "generating_scenes"
      }
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
      data: {
        status: "ready_to_render"
      }
    });

    return NextResponse.json({ scenes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scene generation failed" },
      { status: 500 }
    );
  }
}
