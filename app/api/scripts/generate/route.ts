import { NextResponse } from "next/server";
import { OpenAIService, fetchNewsContext } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const openAIService = new OpenAIService(keys.openAiApiKey);

    const body = await request.json();

    // If the user has configured a news provider (Tavily / NewsAPI), fetch a
    // grounding block from the user's prompt and feed it into the script LLM
    // call. This is far more reliable than OpenAI's web_search_preview tool
    // (which is gated by tier / model) for current-events content.
    let groundingContext = "";
    try {
      const grounding = await fetchNewsContext(body.prompt, {
        tavilyApiKey: keys.tavilyApiKey,
        newsApiKey: keys.newsApiKey
      });
      groundingContext = grounding.context;
      if (grounding.provider !== "none") {
        console.info(
          `[scripts/generate] grounded via ${grounding.provider} with ${grounding.sources.length} source(s)`
        );
      }
    } catch (err) {
      console.warn("[scripts/generate] news grounding failed:", err);
    }

    const result = await openAIService.generateStory({
      prompt: body.prompt,
      genre: body.genre,
      language: body.language,
      targetDurationSec: body.targetDurationSec,
      groundingContext
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[scripts/generate] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Script generation failed" },
      { status: 500 }
    );
  }
}
