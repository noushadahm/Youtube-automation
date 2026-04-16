import { NextResponse } from "next/server";
import { OpenAIService } from "@/lib/services";

const openAIService = new OpenAIService();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await openAIService.improveScript(body.story, body.mode);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Script improvement failed" },
      { status: 500 }
    );
  }
}
