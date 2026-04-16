import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ProjectService } from "@/lib/services";

const projectService = new ProjectService();
const fallbackUserId = "00000000-0000-0000-0000-000000000001";
const fallbackUserEmail = "local-demo@storyflow.studio";

async function ensureFallbackUser() {
  await db.user.upsert({
    where: {
      email: fallbackUserEmail
    },
    update: {},
    create: {
      id: fallbackUserId,
      email: fallbackUserEmail
    }
  });
}

export async function GET() {
  try {
    await ensureFallbackUser();
    const projects = await projectService.listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list projects" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    await ensureFallbackUser();
    const body = await request.json();
    const project = await projectService.createProject({
      userId: fallbackUserId,
      title: body.title,
      genre: body.genre,
      language: body.language,
      targetDurationSec: body.targetDurationSec,
      aspectRatio: body.aspectRatio ?? "16:9",
      storySourceType: body.storySourceType
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
