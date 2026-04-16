import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string; sceneId: string } }
) {
  try {
    const body = await request.json();
    const existingScene = await db.scene.findFirst({
      where: {
        id: params.sceneId,
        projectId: params.projectId
      }
    });

    if (!existingScene) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const scene = await db.scene.update({
      where: {
        id: params.sceneId
      },
      data: {
        durationSec: typeof body.durationSec === "number" ? body.durationSec : undefined
      }
    });

    return NextResponse.json({ scene });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update scene" },
      { status: 500 }
    );
  }
}
