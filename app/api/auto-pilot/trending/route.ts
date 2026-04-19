import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenAIService } from "@/lib/services";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";
import { getOpenAIClient } from "@/lib/openai";

const topicsSchema = z.object({
  topics: z.array(
    z.object({
      title: z.string(),
      angle: z.string(),
      hook: z.string(),
      whyNow: z.string()
    })
  )
});

/**
 * Given a broad category/niche, return 5 fresh, web-grounded video ideas the
 * user can turn into projects via Auto-Pilot.
 *
 * Uses OpenAI's web_search_preview tool so suggestions reflect real current
 * events rather than stale training data. Falls back to no-tool mode if
 * the model doesn't support web_search.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    // Best-effort: use the same lazy client wrapper so users don't need to
    // double-configure. Instance the service just so we inherit the model.
    const _svc = new OpenAIService(keys.openAiApiKey);
    void _svc;
    const client = getOpenAIClient(keys.openAiApiKey);

    const body = await request.json();
    const niche = String(body.niche ?? "").trim();
    const format = String(body.format ?? "youtube-longform").trim();
    const count = Math.max(3, Math.min(10, Number(body.count ?? 5)));

    if (!niche) {
      return NextResponse.json({ error: "niche is required" }, { status: 400 });
    }

    const system = `
You are a YouTube content strategist. Generate VIRAL video ideas that a
creator can publish THIS WEEK. Use the web_search tool to ground each idea
in a real current event, trending topic, new release, controversy, study,
stat, or statement. NEVER invent news — if you can't find a real hook,
return fewer ideas rather than fake ones.

Each idea must include:
- title: clickable, under 65 chars, no clickbait lies
- angle: the unique point of view (1 sentence)
- hook: the first-3-seconds line that makes people stay
- whyNow: the REAL-world reason this is timely right now (cite the trigger)

Format: ${format}. Niche: ${niche}. Return exactly valid JSON matching the schema.

JSON schema:
{
  "topics": [
    { "title": "string", "angle": "string", "hook": "string", "whyNow": "string" }
  ]
}
`;

    const userMessage = JSON.stringify({ niche, format, count });

    async function run(withSearch: boolean) {
      const resp = await client.responses.create({
        model: "gpt-4.1-mini",
        tools: withSearch ? [{ type: "web_search_preview" } as never] : undefined,
        input: [
          { role: "system", content: system },
          { role: "user", content: userMessage }
        ]
      });
      return resp.output_text;
    }

    let text: string;
    try {
      text = await run(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!/web_search|tool/i.test(msg)) throw err;
      console.warn("[trending] web_search unavailable, retrying without:", msg);
      text = await run(false);
    }

    const parsed = topicsSchema.parse(JSON.parse(text));
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[trending] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Trending lookup failed" },
      { status: 500 }
    );
  }
}
