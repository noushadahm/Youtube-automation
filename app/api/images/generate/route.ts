import { NextResponse } from "next/server";
import { ImageGenerationService } from "@/lib/services";

const imageGenerationService = new ImageGenerationService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await imageGenerationService.generateAndStoreImage({
      projectId: body.projectId,
      sceneNumber: body.sceneNumber,
      prompt: body.prompt
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Image generation failed" },
      { status: 500 }
    );
  }
}
