import { Worker } from "bullmq";
import { redis } from "@/lib/redis";
import {
  ImageGenerationService,
  OpenAIService,
  ProjectService,
  SceneService,
  SubtitleService,
  VideoRenderService
} from "@/lib/services";

const projectService = new ProjectService();
const openAIService = new OpenAIService();
const sceneService = new SceneService();
const imageGenerationService = new ImageGenerationService();
const subtitleService = new SubtitleService();
const videoRenderService = new VideoRenderService();

new Worker(
  "script-generation",
  async (job) => {
    const { projectId, prompt, genre, language, targetDurationSec } = job.data;
    await projectService.setStatus(projectId, "generating_script");
    const result = await openAIService.generateStory({ prompt, genre, language, targetDurationSec });
    await projectService.updateScript(projectId, result.story, result.title);
    await projectService.setStatus(projectId, "generating_scenes");
  },
  { connection: redis }
);

new Worker(
  "scene-generation",
  async (job) => {
    const { projectId, title, story, targetDurationSec, genre, language, styleSuffix } = job.data;
    await projectService.setStatus(projectId, "generating_scenes");
    const result = await sceneService.planScenes({ title, story, targetDurationSec, genre, language, styleSuffix });
    await projectService.replaceScenes(projectId, result.scenes);
    await projectService.setStatus(projectId, "generating_images");
  },
  { connection: redis }
);

new Worker(
  "image-generation",
  async (job) => {
    const { projectId, sceneNumber, prompt } = job.data;
    await imageGenerationService.generateAndStoreImage({ projectId, sceneNumber, prompt });
  },
  { connection: redis }
);

new Worker(
  "audio-generation",
  async (job) => {
    const { projectId, subtitleChunks } = job.data;
    await subtitleService.persistSrt(projectId, subtitleChunks);
    await projectService.setStatus(projectId, "ready_to_render");
  },
  { connection: redis }
);

new Worker(
  "video-render",
  async (job) => {
    const { projectId, aspectRatio, scenes, narrationAudioPath, subtitlesPath, backgroundMusicPath } = job.data;
    await projectService.setStatus(projectId, "rendering");
    await videoRenderService.renderProject({
      projectId,
      aspectRatio,
      scenes,
      narrationAudioPath,
      subtitlesPath,
      backgroundMusicPath
    });
    await projectService.setStatus(projectId, "completed");
  },
  { connection: redis }
);

console.info("[worker] StoryFlow workers started.");
