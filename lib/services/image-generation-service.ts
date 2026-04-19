import { GeminiService } from "@/lib/services/gemini-service";

export class ImageGenerationService {
  private geminiService: GeminiService;

  constructor(geminiApiKey?: string, imageModel?: string) {
    this.geminiService = new GeminiService(geminiApiKey, imageModel);
  }

  async generateAndStoreImage(input: {
    projectId: string;
    sceneNumber: number;
    prompt: string;
    retries?: number;
  }) {
    const retries = input.retries ?? 2;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await this.geminiService.generateImageToFile({
          prompt: input.prompt,
          projectId: input.projectId,
          sceneNumber: input.sceneNumber
        });
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
      }
    }

    throw new Error("Image generation failed after retries.");
  }
}
