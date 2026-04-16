import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai";
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
}

export class OpenAIService {
  private readonly model = "gpt-4.1-mini";
  private readonly imageModel = "gpt-image-1";

  private get client() {
    return getOpenAIClient();
  }

  async generateStory(input: GenerateStoryInput) {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        {
          role: "system",
          content: generateStoryPrompt
        },
        {
          role: "user",
          content: JSON.stringify({
            ...input,
            targetSceneCount: deriveSceneCount(input.targetDurationSec)
          })
        }
      ]
    });

    return storySchema.parse(JSON.parse(response.output_text));
  }

  async improveScript(story: string, mode: string) {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "system", content: improveScriptPrompt },
        {
          role: "user",
          content: JSON.stringify({ story, mode })
        }
      ]
    });

    return storySchema.extend({ changeSummary: z.string() }).parse(JSON.parse(response.output_text));
  }

  async splitIntoScenes(input: {
    title: string;
    story: string;
    targetDurationSec: number;
    genre: string;
    language: string;
    styleSuffix: string;
  }): Promise<StoryPlan> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "system", content: splitIntoScenesPrompt },
        {
          role: "user",
          content: JSON.stringify({
            ...input,
            targetSceneCount: deriveSceneCount(input.targetDurationSec)
          })
        }
      ]
    });

    return scenePlanSchema.parse(JSON.parse(response.output_text));
  }

  async generateImagePrompts(input: { scenes: ScenePlan[]; styleSuffix: string }) {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "system", content: generateImagePromptsPrompt },
        { role: "user", content: JSON.stringify(input) }
      ]
    });

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
      .parse(JSON.parse(response.output_text));
  }

  async generateSubtitles(scenes: ScenePlan[]): Promise<SubtitleChunk[]> {
    const response = await this.client.responses.create({
      model: this.model,
      input: [
        { role: "system", content: subtitleChunksPrompt },
        { role: "user", content: JSON.stringify({ scenes }) }
      ]
    });

    return subtitleSchema.parse(JSON.parse(response.output_text)).chunks;
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
