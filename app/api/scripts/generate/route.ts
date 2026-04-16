import { NextResponse } from "next/server";
import { OpenAIService } from "@/lib/services";

const openAIService = new OpenAIService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await openAIService.generateStory({
      prompt: body.prompt,
      genre: body.genre,
      language: body.language,
      targetDurationSec: body.targetDurationSec
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Script generation failed" },
      { status: 500 }
    );
  }
}
