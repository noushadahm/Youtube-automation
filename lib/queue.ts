import { Queue } from "bullmq";
import { redis } from "@/lib/redis";

export const queues = {
  script: new Queue("script-generation", { connection: redis }),
  scenes: new Queue("scene-generation", { connection: redis }),
  images: new Queue("image-generation", { connection: redis }),
  audio: new Queue("audio-generation", { connection: redis }),
  render: new Queue("video-render", { connection: redis })
};

export async function enqueueProjectPipeline(projectId: string) {
  await queues.script.add("generate-script", { projectId });
}
