import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { deriveSceneCount } from "@/lib/utils";
import type { StoryPlan, SubtitleChunk } from "@/types";

const scenePlanSchema = z.object({
  title: z.string(),
  story: z.string(),
  totalEstimatedDuration: z.number(),
  scenes: z.array(
    z.object({
      sceneNumber: z.number(),
      narration: z.string(),
      subtitle: z.string(),
      visualDescription: z.string(),
      imagePrompt: z.string(),
      durationSec: z.number()
    })
  )
});

const subtitleChunkSchema = z.object({
  chunks: z.array(
    z.object({
      index: z.number(),
      startSec: z.number(),
      endSec: z.number(),
      text: z.string()
    })
  )
});

export class GeminiService {
  private env = getEnv();
  private textModel = "gemini-2.5-flash";
  private imageModel = "gemini-2.5-flash-image";

  private get apiKey() {
    if (!this.env.geminiApiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    return this.env.geminiApiKey;
  }

  async generateScenes(input: {
    title: string;
    story: string;
    targetDurationSec: number;
    genre: string;
    language: string;
    styleSuffix: string;
  }): Promise<StoryPlan> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.textModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    "Split this story into scene-based video beats for a YouTube narration project.",
                    "Return only structured JSON matching the provided schema.",
                    `Title: ${input.title}`,
                    `Genre: ${input.genre}`,
                    `Language: ${input.language}`,
                    `Target duration seconds: ${input.targetDurationSec}`,
                    `Target scene count: ${deriveSceneCount(input.targetDurationSec)}`,
                    `Global style suffix: ${input.styleSuffix}`,
                    "Rules:",
                    "- Keep subtitles shorter than narration.",
                    "- Make each image prompt cinematic and story-specific.",
                    "- Preserve character and environment consistency across all prompts.",
                    "- Aim for one scene every 10 to 15 seconds.",
                    `Story:\n${input.story}`
                  ].join("\n")
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              properties: {
                title: { type: "string" },
                story: { type: "string" },
                totalEstimatedDuration: { type: "number" },
                scenes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      sceneNumber: { type: "number" },
                      narration: { type: "string" },
                      subtitle: { type: "string" },
                      visualDescription: { type: "string" },
                      imagePrompt: { type: "string" },
                      durationSec: { type: "number" }
                    },
                    required: [
                      "sceneNumber",
                      "narration",
                      "subtitle",
                      "visualDescription",
                      "imagePrompt",
                      "durationSec"
                    ]
                  }
                }
              },
              required: ["title", "story", "totalEstimatedDuration", "scenes"]
            }
          }
        })
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Gemini scene generation failed");
    }

    const text = payload.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
    if (!text) {
      throw new Error("Gemini returned no scene JSON.");
    }

    return scenePlanSchema.parse(JSON.parse(text));
  }

  async generateImageToFile(input: {
    prompt: string;
    projectId: string;
    sceneNumber: number;
  }) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.imageModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Generate a cinematic story illustration. Return an image.\n${input.prompt}`
                }
              ]
            }
          ]
        })
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Gemini image generation failed");
    }

    const imagePart = payload.candidates?.[0]?.content?.parts?.find(
      (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData?.data
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error("Gemini returned no image data.");
    }

    const outputDir = path.join(this.env.mediaRoot, input.projectId, "images");
    await fs.mkdir(outputDir, { recursive: true });
    const extension = imagePart.inlineData.mimeType === "image/png" ? "png" : "jpg";
    const outputPath = path.join(outputDir, `scene-${input.sceneNumber}.${extension}`);
    await fs.writeFile(outputPath, Buffer.from(imagePart.inlineData.data, "base64"));

    return { localPath: outputPath, url: outputPath };
  }

  private async uploadFile(filePath: string, mimeType: string) {
    const fileBuffer = await fs.readFile(filePath);
    const startResponse = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
      method: "POST",
      headers: {
        "x-goog-api-key": this.apiKey,
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": String(fileBuffer.byteLength),
        "X-Goog-Upload-Header-Content-Type": mimeType,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        file: {
          display_name: path.basename(filePath)
        }
      })
    });

    if (!startResponse.ok) {
      const payload = await startResponse.json().catch(() => ({}));
      throw new Error(payload.error?.message ?? "Gemini file upload start failed");
    }

    const uploadUrl = startResponse.headers.get("x-goog-upload-url");
    if (!uploadUrl) {
      throw new Error("Gemini upload URL missing");
    }

    const uploadResponse = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        "Content-Length": String(fileBuffer.byteLength),
        "X-Goog-Upload-Offset": "0",
        "X-Goog-Upload-Command": "upload, finalize"
      },
      body: fileBuffer
    });

    const uploadPayload = await uploadResponse.json();
    if (!uploadResponse.ok) {
      throw new Error(uploadPayload.error?.message ?? "Gemini file upload failed");
    }

    return uploadPayload.file as { uri: string; mimeType: string };
  }

  async transcribeAudioToSubtitleChunks(audioPath: string): Promise<SubtitleChunk[]> {
    const extension = path.extname(audioPath).toLowerCase();
    const mimeType =
      extension === ".mp3"
        ? "audio/mpeg"
        : extension === ".wav"
          ? "audio/wav"
          : extension === ".webm"
            ? "audio/webm"
            : "application/octet-stream";

    const uploadedFile = await this.uploadFile(audioPath, mimeType);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.textModel}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": this.apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: [
                    "Generate subtitle chunks for this narration audio.",
                    "Return only valid JSON.",
                    "Requirements:",
                    "- Each chunk must include index, startSec, endSec, and text.",
                    "- Timestamps must match the spoken audio closely.",
                    "- Subtitle text should be short, readable, and suitable for on-screen captions.",
                    "- Do not merge long paragraphs into one caption.",
                    "- Use consecutive chunk indexes starting at 1."
                  ].join("\n")
                },
                {
                  file_data: {
                    mime_type: uploadedFile.mimeType,
                    file_uri: uploadedFile.uri
                  }
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              properties: {
                chunks: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: { type: "number" },
                      startSec: { type: "number" },
                      endSec: { type: "number" },
                      text: { type: "string" }
                    },
                    required: ["index", "startSec", "endSec", "text"]
                  }
                }
              },
              required: ["chunks"]
            }
          }
        })
      }
    );

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "Gemini audio transcription failed");
    }

    const text = payload.candidates?.[0]?.content?.parts?.find((part: { text?: string }) => part.text)?.text;
    if (!text) {
      throw new Error("Gemini returned no subtitle JSON.");
    }

    return subtitleChunkSchema.parse(JSON.parse(text)).chunks;
  }
}
