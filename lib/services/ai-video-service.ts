import { downloadToBuffer } from "@/lib/storage";

/**
 * Image-to-video via Google Veo, accessed through the Gemini API.
 * Uses the same GEMINI_API_KEY the rest of the app already has — no extra
 * subscription required. Falls back gracefully if the user's key doesn't have
 * Veo access (the error surfaces in the API route response).
 *
 * Veo is an async / long-running operation: submit → poll → download.
 */
export interface AiVideoInput {
  /** Storage object path for the source still image. */
  imageStoragePath: string;
  /** Prompt describing motion / camera / action. */
  prompt: string;
  /** Target clip duration in seconds (Veo supports 5–8s). */
  durationSec: number;
  aspectRatio?: "16:9" | "9:16";
}

export interface AiVideoOutput {
  /** Binary video bytes. */
  videoBuffer: Buffer;
  /** Content-Type of the video (always video/mp4 currently). */
  contentType: string;
  model: string;
}

const DEFAULT_MODEL = "veo-2.0-generate-001";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 6 * 60_000; // Veo renders can take 2–5 min

export class AiVideoService {
  private readonly apiKey: string;
  private readonly model: string;

  constructor(apiKey: string | undefined, model?: string) {
    if (!apiKey) {
      throw new Error(
        "Gemini API key missing. Add it under Settings to use AI video generation."
      );
    }
    this.apiKey = apiKey;
    this.model = model && model.trim() ? model.trim() : DEFAULT_MODEL;
  }

  async generateClip(input: AiVideoInput): Promise<AiVideoOutput> {
    const imageBuffer = await downloadToBuffer(input.imageStoragePath);
    const imageBase64 = imageBuffer.toString("base64");

    // Kick off the long-running generation.
    const startRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:predictLongRunning`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey
        },
        body: JSON.stringify({
          instances: [
            {
              prompt: input.prompt,
              image: {
                bytesBase64Encoded: imageBase64,
                mimeType: "image/png"
              }
            }
          ],
          parameters: {
            aspectRatio: input.aspectRatio ?? "16:9",
            durationSeconds: String(
              Math.max(5, Math.min(8, Math.round(input.durationSec)))
            ),
            enhancePrompt: true,
            personGeneration: "allow_adult"
          }
        })
      }
    );

    if (!startRes.ok) {
      const text = await startRes.text();
      throw new Error(`Veo request failed (${startRes.status}): ${text.slice(0, 500)}`);
    }

    const startPayload = (await startRes.json()) as { name?: string };
    if (!startPayload.name) {
      throw new Error("Veo: no operation name in response");
    }
    const operationName = startPayload.name;

    // Poll until done.
    const startedAt = Date.now();
    while (true) {
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        throw new Error("Veo: generation timed out after 6 minutes");
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

      const pollRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${operationName}`,
        { headers: { "x-goog-api-key": this.apiKey } }
      );
      if (!pollRes.ok) {
        const text = await pollRes.text();
        throw new Error(`Veo poll failed (${pollRes.status}): ${text.slice(0, 500)}`);
      }

      const poll = (await pollRes.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: {
          generatedVideos?: Array<{ video?: { uri?: string }; mimeType?: string }>;
          generateVideoResponse?: {
            generatedSamples?: Array<{ video?: { uri?: string }; mimeType?: string }>;
          };
        };
      };

      if (poll.error?.message) {
        throw new Error(`Veo error: ${poll.error.message}`);
      }
      if (!poll.done) continue;

      // Google has used slightly different response shapes across API versions.
      // Handle both.
      const videos =
        poll.response?.generatedVideos ??
        poll.response?.generateVideoResponse?.generatedSamples ??
        [];
      const first = videos[0];
      if (!first?.video?.uri) {
        throw new Error(
          `Veo: operation done but no video URI returned. Payload: ${JSON.stringify(poll).slice(0, 500)}`
        );
      }

      // Download the video bytes. The URI requires the API key.
      const sep = first.video.uri.includes("?") ? "&" : "?";
      const videoRes = await fetch(`${first.video.uri}${sep}key=${this.apiKey}`);
      if (!videoRes.ok) {
        throw new Error(`Veo: failed to download video bytes (${videoRes.status})`);
      }
      const videoBuffer = Buffer.from(await videoRes.arrayBuffer());
      return {
        videoBuffer,
        contentType: first.mimeType ?? "video/mp4",
        model: this.model
      };
    }
  }
}
