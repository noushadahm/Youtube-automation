import { getEnv } from "@/lib/env";

interface ElevenLabsConfig {
  apiKey?: string;
  voiceId?: string;
  model?: string;
  /** 0–1. Lower = more expressive / less consistent. 0.3–0.45 is natural. */
  stability?: number;
  /** 0–1. Higher = stays closer to the original voice. 0.7–0.85 recommended. */
  similarityBoost?: number;
  /** 0–1. Adds emotional range. 0.3–0.5 sounds human; 0 is flat / robotic. */
  style?: number;
  /** Extra clarity pass; improves perceived naturalness. */
  useSpeakerBoost?: boolean;
}

export class ElevenLabsService {
  private env = getEnv();
  private readonly maxChunkLength = 2200;
  private readonly config: ElevenLabsConfig;

  constructor(config: ElevenLabsConfig = {}) {
    this.config = config;
  }

  private get apiKey() {
    return this.config.apiKey ?? this.env.elevenLabsApiKey;
  }

  private get voiceId() {
    return this.config.voiceId ?? this.env.elevenLabsVoiceId;
  }

  private get model() {
    // `eleven_multilingual_v2` is the current quality default — much more
    // natural than `turbo` variants for narration work.
    return this.config.model ?? this.env.elevenLabsModel ?? "eleven_multilingual_v2";
  }

  private get voiceSettings() {
    // Tuned for natural-sounding narration. Callers can override any of these
    // per-user via Settings.
    return {
      stability: this.config.stability ?? 0.4,
      similarity_boost: this.config.similarityBoost ?? 0.8,
      style: this.config.style ?? 0.35,
      use_speaker_boost: this.config.useSpeakerBoost ?? true
    };
  }

  private splitText(text: string) {
    if (text.length <= this.maxChunkLength) {
      return [text];
    }

    const sentences = text
      .split(/(?<=[.!?।])\s+/)
      .map((sentence) => sentence.trim())
      .filter(Boolean);

    const chunks: string[] = [];
    let currentChunk = "";

    for (const sentence of sentences) {
      const candidate = currentChunk ? `${currentChunk} ${sentence}` : sentence;
      if (candidate.length <= this.maxChunkLength) {
        currentChunk = candidate;
        continue;
      }

      if (currentChunk) {
        chunks.push(currentChunk);
      }

      if (sentence.length <= this.maxChunkLength) {
        currentChunk = sentence;
        continue;
      }

      for (let index = 0; index < sentence.length; index += this.maxChunkLength) {
        chunks.push(sentence.slice(index, index + this.maxChunkLength));
      }
      currentChunk = "";
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks;
  }

  private async generateSpeechChunk(text: string) {
    if (!this.apiKey || !this.voiceId) {
      throw new Error(
        "ElevenLabs credentials missing. Add your API key and Voice ID under Settings."
      );
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.apiKey,
          Accept: "audio/mpeg"
        },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: this.voiceSettings
        })
      }
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`ElevenLabs request failed with ${response.status}: ${errorBody}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  async generateSpeech(text: string) {
    const chunks = this.splitText(text);
    const audioChunks: Buffer[] = [];

    for (const chunk of chunks) {
      audioChunks.push(await this.generateSpeechChunk(chunk));
    }

    return audioChunks;
  }

  /**
   * Generate a royalty-free music track from a text prompt using ElevenLabs
   * Music API. Returns an MP3 buffer.
   *
   * Docs: https://elevenlabs.io/docs/api-reference/music/compose
   * Endpoint: POST /v1/music — body { prompt, music_length_ms }
   */
  async generateMusic(prompt: string, durationSec = 30): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API key missing. Add it under Settings.");
    }
    const clampedSec = Math.max(10, Math.min(240, Math.round(durationSec)));
    const response = await fetch("https://api.elevenlabs.io/v1/music", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": this.apiKey,
        Accept: "audio/mpeg"
      },
      body: JSON.stringify({
        prompt,
        music_length_ms: clampedSec * 1000
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `ElevenLabs music request failed with ${response.status}: ${errorBody.slice(0, 500)}`
      );
    }

    return Buffer.from(await response.arrayBuffer());
  }
}
