import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai";

/**
 * Robust JSON extractor. Handles:
 *  - Raw JSON (perfect case)
 *  - Markdown-wrapped: ```json\n{...}\n```
 *  - Preambles: "Sure, here's the script: {...}"
 *  - Trailing explanations after the JSON
 *
 * Throws with a helpful snippet of the raw text if nothing parses.
 */
function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Try direct parse first — fastest path.
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // Strip markdown code fences.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      /* fall through */
    }
  }
  // Find first `{` through matching `}` (greedy to the last `}`).
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      /* fall through */
    }
  }
  throw new Error(
    `Model did not return parseable JSON. First 300 chars: ${trimmed.slice(0, 300)}`
  );
}
import { generateStoryPrompt } from "@/lib/prompts/generateStory";
import { splitIntoScenesPrompt } from "@/lib/prompts/splitIntoScenes";
import { generateImagePromptsPrompt } from "@/lib/prompts/generateImagePrompts";
import { improveScriptPrompt } from "@/lib/prompts/improveScript";
import { subtitleChunksPrompt } from "@/lib/prompts/subtitleChunks";
import { deriveSceneCount } from "@/lib/utils";
import type { ScenePlan, StoryPlan, SubtitleChunk } from "@/types";

const storySchema = z.object({
  title: z.string(),
  story: z.string(),
  totalEstimatedDuration: z.number()
});

const sceneSchema = z.object({
  sceneNumber: z.number(),
  narration: z.string(),
  subtitle: z.string(),
  visualDescription: z.string(),
  imagePrompt: z.string(),
  durationSec: z.number()
});

const scenePlanSchema = storySchema.extend({
  scenes: z.array(sceneSchema)
});

const subtitleSchema = z.object({
  chunks: z.array(
    z.object({
      index: z.number(),
      startSec: z.number(),
      endSec: z.number(),
      text: z.string()
    })
  )
});

interface GenerateStoryInput {
  prompt: string;
  genre: string;
  language: string;
  targetDurationSec: number;
  /** Optional pre-fetched news / web-search grounding. Injected into the
   * system prompt so the model can cite real current events. */
  groundingContext?: string;
}

export class OpenAIService {
  private readonly model = "gpt-4.1-mini";
  private readonly imageModel = "gpt-image-1";
  private readonly apiKey?: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  private get client() {
    return getOpenAIClient(this.apiKey);
  }

  async generateStory(input: GenerateStoryInput) {
    // Grounding comes from our NewsService (Tavily / NewsAPI) — NOT from
    // OpenAI's web_search_preview tool. The web_search tool regularly returns
    // plain-text search summaries instead of JSON, which breaks every
    // downstream stage. By owning the grounding step ourselves, we get
    // deterministic JSON output plus better (free-tier friendly) news quality.
    const groundingBlock = input.groundingContext?.trim()
      ? `\n\n===== REAL-TIME NEWS CONTEXT (ground truth) =====\n${input.groundingContext}\n===== END CONTEXT =====\n\nUse these facts as the source of truth for anything time-sensitive. Do NOT invent facts. If the context is empty, use general knowledge but avoid specifics that could be stale.`
      : "";

    const systemPrompt =
      generateStoryPrompt +
      "\n\nReturn ONLY a single JSON object matching the schema. " +
      "No markdown fences, no prose before or after, no explanations." +
      groundingBlock;

    const userPayload = JSON.stringify({
      ...input,
      targetSceneCount: deriveSceneCount(input.targetDurationSec)
    });

    // Chat Completions with json_object mode is the MOST reliable path — it
    // works on every OpenAI tier and forces strict JSON output.
    const chat = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPayload }
      ]
    });
    const text = chat.choices[0]?.message?.content ?? "";

    if (!text) throw new Error("OpenAI returned an empty script.");
    return storySchema.parse(extractJson(text));
  }

  /** Shared helper: Chat Completions with strict JSON-object mode. */
  private async chatJson(system: string, userPayload: unknown): Promise<string> {
    const chat = await this.client.chat.completions.create({
      model: this.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            system +
            "\n\nReturn ONLY a single JSON object matching the schema. No markdown, no prose, no code fences."
        },
        { role: "user", content: JSON.stringify(userPayload) }
      ]
    });
    return chat.choices[0]?.message?.content ?? "";
  }

  async improveScript(story: string, mode: string) {
    const text = await this.chatJson(improveScriptPrompt, { story, mode });
    if (!text) throw new Error("OpenAI returned empty response for improveScript.");
    return storySchema.extend({ changeSummary: z.string() }).parse(extractJson(text));
  }

  async splitIntoScenes(input: {
    title: string;
    story: string;
    targetDurationSec: number;
    genre: string;
    language: string;
    styleSuffix: string;
  }): Promise<StoryPlan> {
    const text = await this.chatJson(splitIntoScenesPrompt, {
      ...input,
      targetSceneCount: deriveSceneCount(input.targetDurationSec)
    });
    if (!text) throw new Error("OpenAI returned empty response for splitIntoScenes.");
    return scenePlanSchema.parse(extractJson(text));
  }

  async generateImagePrompts(input: { scenes: ScenePlan[]; styleSuffix: string }) {
    const text = await this.chatJson(generateImagePromptsPrompt, input);
    if (!text) throw new Error("OpenAI returned empty response for generateImagePrompts.");
    return z
      .object({
        styleSuffix: z.string(),
        scenes: z.array(
          z.object({
            sceneNumber: z.number(),
            imagePrompt: z.string(),
            visualDescription: z.string()
          })
        )
      })
      .parse(extractJson(text));
  }

  async generateSubtitles(scenes: ScenePlan[]): Promise<SubtitleChunk[]> {
    const text = await this.chatJson(subtitleChunksPrompt, { scenes });
    if (!text) throw new Error("OpenAI returned empty response for generateSubtitles.");
    return subtitleSchema.parse(extractJson(text)).chunks;
  }

  async generateImage(prompt: string) {
    const response = await this.client.images.generate({
      model: this.imageModel,
      prompt,
      size: "1536x1024"
    });

    return response.data[0];
  }
}
