import { NextResponse } from "next/server";
import { ProjectService } from "@/lib/services";

const projectService = new ProjectService();

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const project = await projectService.getProjectById(params.projectId);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch project" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const body = await request.json();
    const project = await projectService.updateScript(params.projectId, body.script ?? "", body.title);
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update project" },
      { status: 500 }
    );
  }
}
