import { NextResponse } from "next/server";
import { SceneService } from "@/lib/services";

const sceneService = new SceneService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await sceneService.planScenes(body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scene generation failed" },
      { status: 500 }
    );
  }
}
