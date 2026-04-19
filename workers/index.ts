/**
 * StoryFlow background workers.
 *
 * Started with: `npm run worker`
 * Keep this process running alongside `npm run dev` / `npm run start`.
 *
 * Each queue has a worker that pulls the full job data from Postgres +
 * Supabase Storage, so restarts don't lose state.
 *
 * Currently wired to actually be used by API routes:
 *   - video-render   (via POST /api/projects/[projectId]/render)
 *
 * Wired to services but NOT yet enqueued from any API route (enable by having
 * that route call queues.xxx.add instead of running inline):
 *   - script-generation
 *   - scene-generation
 *   - image-generation
 *   - audio-generation
 */
// MUST be the first import — loads .env.local + .env into process.env
// before any other module (lib/env, lib/redis, Prisma, Supabase) reads it.
import "./load-env";

import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { Worker } from "bullmq";

import { redis } from "@/lib/redis";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { getUserAiKeys } from "@/lib/user-keys";
import {
  QUEUE_NAMES,
  type AudioJobPayload,
  type ImageJobPayload,
  type RenderJobPayload,
  type SceneJobPayload,
  type ScriptJobPayload
} from "@/lib/queue";
import {
  ElevenLabsService,
  GeminiService,
  ImageGenerationService,
  OpenAIService,
  ProjectService,
  SceneService,
  SubtitleService,
  VideoRenderService
} from "@/lib/services";
import { downloadToLocal, uploadLocalFile, isStoragePath } from "@/lib/storage";
import type { SubtitleChunk } from "@/types";

const env = getEnv();
const projectService = new ProjectService();
const subtitleService = new SubtitleService();
const videoRenderService = new VideoRenderService();

// ---------- helpers shared by workers ----------

async function ffprobeDurationSec(filePath: string): Promise<number> {
  const ffprobePath = path.join(path.dirname(env.ffmpegPath), "ffprobe");
  return new Promise((resolve, reject) => {
    const child = spawn(ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath
    ]);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c.toString()));
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(stderr || `ffprobe exited ${code}`));
      resolve(Number.parseFloat(stdout.trim()));
    });
  });
}

/**
 * Ensure a file exists on local disk. If the stored `localPath` is missing
 * (e.g. worker was restarted, /tmp was wiped) but a Supabase Storage path is
 * available in `url`, download it to `localPath`.
 */
async function ensureLocalCopy(localPath: string | null, storagePath: string | null): Promise<string> {
  if (localPath) {
    try {
      await fs.access(localPath);
      return localPath;
    } catch {
      // fall through to storage
    }
  }
  if (storagePath && isStoragePath(storagePath)) {
    const dest = localPath ?? path.join(env.mediaRoot, storagePath);
    return await downloadToLocal(storagePath, dest);
  }
  throw new Error("Asset has no local copy and no storage path");
}

// ---------- RENDER worker (actually used) ----------

const renderWorker = new Worker<RenderJobPayload>(
  QUEUE_NAMES.render,
  async (job) => {
    const {
      renderJobId,
      projectId,
      userId,
      aspectRatio,
      includeSubtitles,
      generateSrt,
      hookText,
      compressForUpload,
      includeCover,
      coverDurationSec
    } = job.data;

    const setProgress = async (progress: number, status?: string) => {
      await db.renderJob.update({
        where: { id: renderJobId },
        data: {
          progress,
          ...(status ? { status } : {})
        }
      });
      await job.updateProgress(progress);
    };

    try {
      await setProgress(5, "processing");

      const project = await db.project.findFirst({
        where: { id: projectId, userId },
        include: {
          scenes: { orderBy: { order: "asc" } },
          assets: { orderBy: { createdAt: "desc" } }
        }
      });
      if (!project) throw new Error("Project not found");

      // Gather ALL narration tracks (type=audio). The first one is used as
      // the "main" narration (drives duration scaling + subtitles). Additional
      // ones are mixed in as extra voice tracks with their own offset/volume.
      const audioAssets = project.assets
        .filter((a) => a.type === "audio")
        .sort((a, b) => {
          // Stable order: the oldest asset first (matches generation order).
          const tA = new Date(a.createdAt).getTime();
          const tB = new Date(b.createdAt).getTime();
          return tA - tB;
        });
      if (audioAssets.length === 0) {
        throw new Error("No narration audio for this project");
      }
      const primaryAudio = audioAssets[0];
      const secondaryAudios = audioAssets.slice(1);

      const localAudioPath = await ensureLocalCopy(primaryAudio.localPath, primaryAudio.url);
      await setProgress(15);

      // Materialise scene images (and per-scene AI video clips, if any) on local disk.
      const scenesForFfmpeg: Array<{
        sceneNumber: number;
        subtitle: string;
        durationSec: number;
        imagePath: string | null;
        videoClipPath: string | null;
        cameraMotion:
          | "none"
          | "zoomIn"
          | "zoomOut"
          | "panLeft"
          | "panRight"
          | "panUp"
          | "panDown";
        transition: "cut" | "fade" | "dissolve";
      }> = [];

      for (const scene of project.scenes) {
        const imageAsset = project.assets.find(
          (a) => a.type === "image" && a.sceneId === scene.id
        );
        // Prefer an AI-generated per-scene video clip if it exists.
        const videoClip = project.assets.find(
          (a) =>
            a.type === "video" &&
            a.sceneId === scene.id &&
            ((a.metadataJson as { kind?: string } | null)?.kind === "scene-clip")
        );

        let imagePath: string | null = null;
        let videoClipPath: string | null = null;
        if (videoClip) {
          videoClipPath = await ensureLocalCopy(videoClip.localPath, videoClip.url);
        } else {
          if (!imageAsset) throw new Error(`Scene ${scene.order} is missing an image`);
          imagePath = await ensureLocalCopy(imageAsset.localPath, imageAsset.url);
        }

        scenesForFfmpeg.push({
          sceneNumber: scene.order,
          subtitle: scene.subtitleText,
          durationSec: scene.durationSec,
          imagePath,
          videoClipPath,
          cameraMotion: (scene.cameraMotion as never) ?? "zoomIn",
          transition: (scene.transition as never) ?? "fade"
        });
      }

      await setProgress(30);

      // Sync scene durations to audio duration.
      const audioDurationSec = await ffprobeDurationSec(localAudioPath);
      const totalSceneDur = scenesForFfmpeg.reduce((s, sc) => s + sc.durationSec, 0) || 1;
      const scale = audioDurationSec / totalSceneDur;
      const scaledScenes = scenesForFfmpeg.map((sc) => ({
        ...sc,
        durationSec: Math.max(1, sc.durationSec * scale)
      }));

      // Subtitles.
      const keys = await getUserAiKeys(userId);
      const gemini = new GeminiService(keys.geminiApiKey);

      let subtitleChunks: SubtitleChunk[];
      try {
        subtitleChunks = await gemini.transcribeAudioToSubtitleChunks(localAudioPath);
      } catch (err) {
        console.warn("[render-worker] subtitle transcription failed, falling back to scene timing", err);
        let t = 0;
        subtitleChunks = scaledScenes.map((s, i) => {
          const start = t;
          t += s.durationSec;
          return { index: i + 1, startSec: start, endSec: t, text: s.subtitle };
        });
      }

      await setProgress(50);

      let subtitlesPath = "";
      if (generateSrt !== false) {
        subtitlesPath = await subtitleService.persistSrt(projectId, subtitleChunks);
        const srtStoragePath = `projects/${projectId}/subtitles/${path.basename(subtitlesPath)}`;
        await uploadLocalFile({
          localPath: subtitlesPath,
          objectPath: srtStoragePath,
          contentType: "application/x-subrip"
        });
        await db.asset.create({
          data: {
            projectId,
            type: "subtitle",
            provider: "gemini-transcription",
            localPath: subtitlesPath,
            url: srtStoragePath,
            metadataJson: { format: "srt" }
          }
        });
      }

      await setProgress(60);

      // Background + extra voice tracks. All type=music AND the secondary
      // audio/voice tracks are mixed in via amix, each with its own
      // offset / trim / volume from metadataJson.
      const musicAssets = project.assets.filter((a) => a.type === "music");
      const musicTracks: Array<{
        path: string;
        offsetSec: number;
        trimStartSec: number;
        durationSec?: number;
        volume: number;
      }> = [];

      // Extra narration voices (audioAssets[1..n]) — default volume 1.0 so
      // they're as loud as the primary narration. Users tune offsets to
      // place each voice at the right moment.
      for (const a of secondaryAudios) {
        try {
          const localPath = await ensureLocalCopy(a.localPath, a.url);
          const meta = (a.metadataJson as Record<string, unknown> | null) ?? {};
          musicTracks.push({
            path: localPath,
            offsetSec: typeof meta.offsetSec === "number" ? meta.offsetSec : 0,
            trimStartSec: typeof meta.trimStartSec === "number" ? meta.trimStartSec : 0,
            durationSec: typeof meta.durationSec === "number" ? meta.durationSec : undefined,
            volume: typeof meta.volume === "number" ? meta.volume : 1.0
          });
        } catch (err) {
          console.warn(`[render-worker] voice asset ${a.id} unavailable, skipping`, err);
        }
      }

      for (const m of musicAssets) {
        try {
          const localPath = await ensureLocalCopy(m.localPath, m.url);
          const meta = (m.metadataJson as Record<string, unknown> | null) ?? {};
          musicTracks.push({
            path: localPath,
            offsetSec: typeof meta.offsetSec === "number" ? meta.offsetSec : 0,
            trimStartSec: typeof meta.trimStartSec === "number" ? meta.trimStartSec : 0,
            durationSec: typeof meta.durationSec === "number" ? meta.durationSec : undefined,
            volume: typeof meta.volume === "number" ? meta.volume : 0.2
          });
        } catch (err) {
          console.warn(`[render-worker] music asset ${m.id} unavailable, skipping`, err);
        }
      }

      // Optional cover intro: find the most recent cover asset for this
      // project and materialise it on local disk.
      let localCoverPath: string | null = null;
      if (includeCover !== false) {
        const coverAsset = project.assets.find(
          (a) =>
            a.type === "image" &&
            (a.metadataJson as { kind?: string } | null)?.kind === "cover"
        );
        if (coverAsset) {
          try {
            localCoverPath = await ensureLocalCopy(coverAsset.localPath, coverAsset.url);
          } catch (err) {
            console.warn("[render-worker] cover asset unavailable, skipping", err);
          }
        }
      }

      // Render.
      const outputPath = await videoRenderService.renderProject({
        projectId,
        aspectRatio: (aspectRatio ?? project.aspectRatio) as "16:9" | "9:16",
        scenes: scaledScenes,
        narrationAudioPath: localAudioPath,
        musicTracks,
        narrationVolume: 1.0,
        subtitlesPath,
        includeSubtitles: includeSubtitles !== false,
        hookText: hookText ?? project.hookText ?? null,
        compressForUpload: Boolean(compressForUpload),
        coverImagePath: localCoverPath,
        coverDurationSec: typeof coverDurationSec === "number" ? coverDurationSec : 0.9
      });

      await setProgress(85);

      const videoStoragePath = `projects/${projectId}/renders/${path.basename(outputPath)}`;
      await uploadLocalFile({
        localPath: outputPath,
        objectPath: videoStoragePath,
        contentType: "video/mp4"
      });

      const videoAsset = await db.asset.create({
        data: {
          projectId,
          type: "video",
          provider: "ffmpeg",
          localPath: outputPath,
          url: videoStoragePath,
          metadataJson: { aspectRatio: aspectRatio ?? project.aspectRatio }
        }
      });

      await db.renderJob.update({
        where: { id: renderJobId },
        data: {
          status: "completed",
          progress: 100,
          outputPath,
          outputUrl: `/api/assets/${videoAsset.id}`
        }
      });

      await db.project.update({
        where: { id: projectId },
        data: { status: "completed" }
      });

      return { videoAssetId: videoAsset.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "render failed";
      await db.renderJob
        .update({
          where: { id: renderJobId },
          data: { status: "failed", errorMessage: message }
        })
        .catch(() => undefined);
      await db.project
        .update({
          where: { id: projectId },
          data: { status: "failed" }
        })
        .catch(() => undefined);
      throw error;
    }
  },
  { connection: redis, concurrency: 1 }
);

// ---------- Placeholder workers for other queues ----------
// These are wired to the service layer so if/when you move these pipelines
// off the HTTP path, there's a consumer ready.

const scriptWorker = new Worker<ScriptJobPayload>(
  QUEUE_NAMES.script,
  async (job) => {
    const { projectId, userId, prompt, genre, language, targetDurationSec } = job.data;
    await projectService.setStatus(projectId, "generating_script");
    const keys = await getUserAiKeys(userId);
    const openai = new OpenAIService(keys.openAiApiKey);
    const result = await openai.generateStory({ prompt, genre, language, targetDurationSec });
    await projectService.updateScript(projectId, result.story, result.title);
    await projectService.setStatus(projectId, "generating_scenes");
  },
  { connection: redis }
);

const sceneWorker = new Worker<SceneJobPayload>(
  QUEUE_NAMES.scenes,
  async (job) => {
    const { projectId, userId, styleSuffix } = job.data;
    const project = await db.project.findFirst({ where: { id: projectId, userId } });
    if (!project) throw new Error("Project not found");
    await projectService.setStatus(projectId, "generating_scenes");

    const keys = await getUserAiKeys(userId);
    const sceneService = new SceneService(keys.geminiApiKey);
    const result = await sceneService.planScenes({
      title: project.title,
      story: project.script,
      targetDurationSec: project.targetDurationSec,
      genre: project.genre,
      language: project.language,
      styleSuffix: styleSuffix ?? "cinematic lighting, consistent character design"
    });
    await projectService.replaceScenes(projectId, result.scenes);
    await projectService.setStatus(projectId, "ready_to_render");
  },
  { connection: redis }
);

const imageWorker = new Worker<ImageJobPayload>(
  QUEUE_NAMES.images,
  async (job) => {
    const { projectId, userId, sceneId } = job.data;
    const project = await db.project.findFirst({
      where: { id: projectId, userId },
      include: { scenes: { orderBy: { order: "asc" } } }
    });
    if (!project) throw new Error("Project not found");

    const keys = await getUserAiKeys(userId);
    const imageService = new ImageGenerationService(keys.geminiApiKey);

    const targets = sceneId
      ? project.scenes.filter((s) => s.id === sceneId)
      : project.scenes;

    for (const scene of targets) {
      const generated = await imageService.generateAndStoreImage({
        projectId,
        sceneNumber: scene.order,
        prompt: scene.imagePrompt
      });
      await db.asset.create({
        data: {
          projectId,
          sceneId: scene.id,
          type: "image",
          provider: "gemini",
          localPath: generated.localPath,
          url: generated.url
        }
      });
    }
  },
  { connection: redis, concurrency: 2 }
);

const audioWorker = new Worker<AudioJobPayload>(
  QUEUE_NAMES.audio,
  async (job) => {
    const { projectId, userId, text } = job.data;
    const keys = await getUserAiKeys(userId);
    const tts = new ElevenLabsService({
      apiKey: keys.elevenLabsApiKey,
      voiceId: keys.elevenLabsVoiceId,
      model: keys.elevenLabsModel
    });
    const chunks = await tts.generateSpeech(text);
    const outDir = path.join(env.mediaRoot, projectId, "audio");
    await fs.mkdir(outDir, { recursive: true });
    const outPath = path.join(outDir, `narration-${Date.now()}.mp3`);
    await fs.writeFile(outPath, Buffer.concat(chunks.map((c) => Uint8Array.from(c))));
    const storagePath = `projects/${projectId}/audio/${path.basename(outPath)}`;
    await uploadLocalFile({ localPath: outPath, objectPath: storagePath, contentType: "audio/mpeg" });
    await db.asset.create({
      data: {
        projectId,
        type: "audio",
        provider: "elevenlabs",
        localPath: outPath,
        url: storagePath,
        metadataJson: { sourceType: "ai_generated" }
      }
    });
  },
  { connection: redis }
);

for (const [name, w] of Object.entries({
  render: renderWorker,
  script: scriptWorker,
  scenes: sceneWorker,
  images: imageWorker,
  audio: audioWorker
})) {
  w.on("ready", () => console.info(`[worker:${name}] ready`));
  w.on("failed", (job, err) =>
    console.error(`[worker:${name}] job ${job?.id} failed:`, err.message)
  );
  w.on("completed", (job) => console.info(`[worker:${name}] job ${job.id} completed`));
}

console.info("[worker] StoryFlow workers running. Waiting for jobs…");

async function shutdown() {
  console.info("[worker] shutting down…");
  await Promise.all([
    renderWorker.close(),
    scriptWorker.close(),
    sceneWorker.close(),
    imageWorker.close(),
    audioWorker.close()
  ]);
  await redis.quit();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
