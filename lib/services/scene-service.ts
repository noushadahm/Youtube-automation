import { GeminiService } from "@/lib/services/gemini-service";
import type { ScenePlan, StoryPlan } from "@/types";

export class SceneService {
  private geminiService: GeminiService;

  constructor(geminiApiKey?: string) {
    this.geminiService = new GeminiService(geminiApiKey);
  }

  async planScenes(input: {
    title: string;
    story: string;
    targetDurationSec: number;
    genre: string;
    language: string;
    styleSuffix: string;
  }): Promise<StoryPlan> {
    return this.geminiService.generateScenes(input);
  }

  async enrichImagePrompts(scenes: ScenePlan[], styleSuffix: string) {
    return scenes.map((scene) => ({
      ...scene,
      imagePrompt: `${scene.imagePrompt}, ${styleSuffix}`,
      visualDescription: scene.visualDescription
    }));
  }
}
