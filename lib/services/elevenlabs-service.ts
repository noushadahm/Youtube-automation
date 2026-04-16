import { getEnv } from "@/lib/env";

export class ElevenLabsService {
  private env = getEnv();
  private readonly maxChunkLength = 2200;

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
    if (!this.env.elevenLabsApiKey || !this.env.elevenLabsVoiceId) {
      throw new Error("ElevenLabs environment variables are missing.");
    }

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.env.elevenLabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.env.elevenLabsApiKey
        },
        body: JSON.stringify({
          text,
          model_id: this.env.elevenLabsModel,
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75
          }
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
}
