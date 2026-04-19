import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ProjectService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const projectService = new ProjectService();

export async function GET(
  _request: Request,
  { params }: { params: { projectId: string } }
) {
  try {
    const user = await requireUser();
    const project = await projectService.getProjectById(params.projectId, user.id);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
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
    const user = await requireUser();
    const owned = await projectService.getProjectById(params.projectId, user.id);
    if (!owned) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const body = await request.json();

    // Accept any subset: script, title, hookText, imageStylePrompt.
    const data: Record<string, unknown> = {};
    if (typeof body.script === "string") data.script = body.script;
    if (typeof body.title === "string") data.title = body.title;
    if (typeof body.hookText === "string") data.hookText = body.hookText;
    if (typeof body.imageStylePrompt === "string") data.imageStylePrompt = body.imageStylePrompt;

    const project = await db.project.update({
      where: { id: params.projectId },
      data
    });
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update project" },
      { status: 500 }
    );
  }
}
