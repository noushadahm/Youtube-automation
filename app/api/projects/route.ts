import { NextResponse } from "next/server";
import { ProjectService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const projectService = new ProjectService();

export async function GET() {
  try {
    const user = await requireUser();
    const projects = await projectService.listProjects(user.id);
    return NextResponse.json({ projects });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const project = await projectService.createProject({
      userId: user.id,
      title: body.title,
      genre: body.genre,
      language: body.language,
      targetDurationSec: body.targetDurationSec,
      aspectRatio: body.aspectRatio ?? "16:9",
      storySourceType: body.storySourceType,
      hookText: typeof body.hookText === "string" ? body.hookText : undefined
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
