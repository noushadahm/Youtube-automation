import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { deriveSceneCount } from "@/lib/utils";
import { uploadBuffer } from "@/lib/storage";
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

// Ordered list of model names to try if the configured one 404s.
// When Gemini renames / deprecates a model, one of these usually still works.
const IMAGE_MODEL_FALLBACKS = [
  "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.0-flash-exp-image-generation"
];

export class GeminiService {
  private env = getEnv();
  private textModel = "gemini-2.5-flash";
  private readonly configuredImageModel: string | undefined;
  private readonly explicitKey?: string;

  constructor(apiKey?: string, imageModel?: string) {
    this.explicitKey = apiKey;
    this.configuredImageModel = imageModel?.trim() || undefined;
  }

  /**
   * Candidate image models in priority order:
   *   1. user-configured (from Settings)
   *   2. GA'd Gemini image (current)
   *   3. older previews as defensive fallbacks
   */
  private get imageModelCandidates(): string[] {
    const seen = new Set<string>();
    const list: string[] = [];
    if (this.configuredImageModel) {
      list.push(this.configuredImageModel);
      seen.add(this.configuredImageModel);
    }
    for (const m of IMAGE_MODEL_FALLBACKS) {
      if (!seen.has(m)) {
        list.push(m);
        seen.add(m);
      }
    }
    return list;
  }

  private get apiKey() {
    const key = this.explicitKey ?? this.env.geminiApiKey;
    if (!key) {
      throw new Error("Gemini API key not set. Add it under Settings, or set GEMINI_API_KEY.");
    }
    return key;
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
                    "Split this narration into scene-based video beats.",
                    "Return only structured JSON matching the provided schema.",
                    `Title: ${input.title}`,
                    `Genre / content type: ${input.genre}`,
                    `Language: ${input.language}`,
                    `Target total duration (seconds): ${input.targetDurationSec}`,
                    `Approximate scene count target: ${deriveSceneCount(input.targetDurationSec)} (adjust up or down as content needs)`,
                    `Global style suffix: ${input.styleSuffix}`,
                    "Rules:",
                    "- VARY scene durations based on content. Fast beats 2-4s; normal 4-8s; longer emotional/complex beats 8-15s. Never make every scene the same length.",
                    "- The SUM of durationSec must approximately equal the target total duration.",
                    "- Scene 1 is the HOOK — the most visually striking beat.",
                    "- Final scene supports the CTA.",
                    "- Subtitles shorter than narration.",
                    "- Image prompts cinematic, specific, visually concrete, consistent characters/environment.",
                    `Script:\n${input.story}`
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
    // Gemini image-capable models require an explicit responseModalities
    // hint in generationConfig. Without it, the model returns text and the
    // route throws "no image data".
    //
    // We walk the candidate list so a single renamed / unavailable model
    // doesn't break the whole pipeline — if the configured model 404s, the
    // next known-good one is tried automatically.
    const candidates = this.imageModelCandidates;
    let response: Response | null = null;
    let payload: {
      error?: { message?: string; code?: number };
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
    } | null = null;
    let modelUsed: string | null = null;
    const errors: string[] = [];

    for (const model of candidates) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
                    text: `Cinematic, photo-realistic illustration. ${input.prompt}`
                  }
                ]
              }
            ],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"]
            }
          })
        }
      );

      const body = await res.json();
      if (res.ok) {
        response = res;
        payload = body;
        modelUsed = model;
        break;
      }

      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      errors.push(`${model}: ${msg}`);
      // If it's a "model not found / not supported" error, try the next one.
      // For any other kind of failure (quota, auth, etc.), fail fast.
      const notFoundish =
        res.status === 404 ||
        /not found|not supported|NOT_FOUND/i.test(msg);
      if (!notFoundish) {
        console.error(`[gemini-image] model=${model} status=${res.status} error=${msg}`);
        throw new Error(msg);
      }
    }

    if (!response || !payload || !modelUsed) {
      const combined = errors.join(" | ");
      console.error(`[gemini-image] no model succeeded. tried: ${combined}`);
      throw new Error(
        `No Gemini image model is available to this key. Tried: ${combined}. ` +
        `Set a valid model in Settings → Gemini image model.`
      );
    }

    if (modelUsed !== (this.configuredImageModel ?? candidates[0])) {
      console.warn(
        `[gemini-image] configured model unavailable, fell back to '${modelUsed}'`
      );
    }

    const imagePart = payload.candidates?.[0]?.content?.parts?.find(
      (part: { inlineData?: { data?: string; mimeType?: string } }) => part.inlineData?.data
    );

    if (!imagePart?.inlineData?.data) {
      throw new Error("Gemini returned no image data.");
    }

    const mimeType = imagePart.inlineData.mimeType ?? "image/png";
    const extension = mimeType === "image/png" ? "png" : "jpg";
    const buffer = Buffer.from(imagePart.inlineData.data, "base64");

    // Write to local ephemeral path so FFmpeg can consume it during render.
    const outputDir = path.join(this.env.mediaRoot, input.projectId, "images");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `scene-${input.sceneNumber}.${extension}`);
    await fs.writeFile(outputPath, buffer);

    // Persistent copy in Supabase Storage.
    const objectPath = `projects/${input.projectId}/images/scene-${input.sceneNumber}.${extension}`;
    await uploadBuffer({ path: objectPath, buffer, contentType: mimeType });

    return { localPath: outputPath, url: objectPath, storagePath: objectPath };
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
