import { Queue, type JobsOptions } from "bullmq";
import { redis } from "@/lib/redis";

export const QUEUE_NAMES = {
  script: "script-generation",
  scenes: "scene-generation",
  images: "image-generation",
  audio: "audio-generation",
  render: "video-render"
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ---- Job payloads ----
// These are the contracts between API routes (producers) and workers (consumers).
// Keep payloads small — store the canonical data in Postgres and reference by id.

export interface RenderJobPayload {
  renderJobId: string; // id of sf_render_jobs row
  projectId: string;
  userId: string;
  aspectRatio?: "16:9" | "9:16";
  includeSubtitles?: boolean;
  generateSrt?: boolean;
  hookText?: string | null;
  compressForUpload?: boolean;
  /** Prepend the project's cover/thumbnail as an intro clip. */
  includeCover?: boolean;
  coverDurationSec?: number;
}

export interface ScriptJobPayload {
  projectId: string;
  userId: string;
  prompt: string;
  genre: string;
  language: string;
  targetDurationSec: number;
}

export interface SceneJobPayload {
  projectId: string;
  userId: string;
  styleSuffix?: string;
}

export interface ImageJobPayload {
  projectId: string;
  userId: string;
  sceneId?: string; // omit to generate for every scene
}

export interface AudioJobPayload {
  projectId: string;
  userId: string;
  text: string;
}

const defaultJobOpts: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: { age: 60 * 60 * 24, count: 500 },
  removeOnFail: { age: 60 * 60 * 24 * 7 }
};

// Typed queue singletons. Reused across HTTP requests.
export const queues = {
  script: new Queue<ScriptJobPayload>(QUEUE_NAMES.script, { connection: redis, defaultJobOptions: defaultJobOpts }),
  scenes: new Queue<SceneJobPayload>(QUEUE_NAMES.scenes, { connection: redis, defaultJobOptions: defaultJobOpts }),
  images: new Queue<ImageJobPayload>(QUEUE_NAMES.images, { connection: redis, defaultJobOptions: defaultJobOpts }),
  audio: new Queue<AudioJobPayload>(QUEUE_NAMES.audio, { connection: redis, defaultJobOptions: defaultJobOpts }),
  render: new Queue<RenderJobPayload>(QUEUE_NAMES.render, { connection: redis, defaultJobOptions: defaultJobOpts })
};

export async function enqueueRender(payload: RenderJobPayload) {
  return queues.render.add("render", payload, { jobId: payload.renderJobId });
}
