import { NextResponse } from "next/server";
import { ImageGenerationService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const imageGenerationService = new ImageGenerationService(
      keys.geminiApiKey,
      keys.geminiImageModel
    );

    const body = await request.json();
    const result = await imageGenerationService.generateAndStoreImage({
      projectId: body.projectId,
      sceneNumber: body.sceneNumber,
      prompt: body.prompt
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
