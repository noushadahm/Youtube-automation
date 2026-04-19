import { NextResponse } from "next/server";
import { OpenAIService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const openAIService = new OpenAIService(keys.openAiApiKey);

    const body = await request.json();
    const result = await openAIService.improveScript(body.story, body.mode);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Script improvement failed" },
      { status: 500 }
    );
  }
}
