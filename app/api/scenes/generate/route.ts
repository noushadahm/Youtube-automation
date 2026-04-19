import { NextResponse } from "next/server";
import { SceneService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const sceneService = new SceneService(keys.geminiApiKey);

    const body = await request.json();
    const result = await sceneService.planScenes(body);
    return NextResponse.json(result);
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
