import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ElevenLabsService } from "@/lib/services";
import { getEnv } from "@/lib/env";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getUserAiKeys } from "@/lib/user-keys";
import { uploadLocalFile } from "@/lib/storage";

const env = getEnv();

async function concatAudioFiles(inputPaths: string[], outputPath: string) {
  const concatFilePath = path.join(path.dirname(outputPath), `concat-${randomUUID()}.txt`);
  const concatContents = inputPaths
    .map((filePath) => `file '${path.resolve(filePath).replace(/'/g, "'\\''")}'`)
    .join("\n");
  await fs.writeFile(concatFilePath, concatContents, "utf8");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(env.ffmpegPath, [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatFilePath,
      "-c",
      "copy",
      outputPath
    ]);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || `FFmpeg exited with code ${code}`));
        return;
      }
      resolve();
    });
  });

  await fs.unlink(concatFilePath).catch(() => undefined);
}

export async function POST(request: Request) {
  let body: { projectId?: string; text?: string } = {};
  try {
    const user = await requireUser();
    const keys = await getUserAiKeys(user.id);
    const elevenLabsService = new ElevenLabsService({
      apiKey: keys.elevenLabsApiKey,
      voiceId: keys.elevenLabsVoiceId,
      model: keys.elevenLabsModel,
      stability: keys.voiceStability,
      similarityBoost: keys.voiceSimilarityBoost,
      style: keys.voiceStyle,
      useSpeakerBoost: keys.voiceSpeakerBoost
    });

    body = await request.json();
    if (!body.projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    if (!body.text?.trim()) {
      return NextResponse.json({ error: "Narration text is required" }, { status: 400 });
    }

    // Ownership check
    const owned = await db.project.findFirst({
      where: { id: body.projectId, userId: user.id }
    });
    if (!owned) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    await db.project.update({
      where: { id: body.projectId },
      data: { status: "generating_audio" }
    });

    const audioChunks = await elevenLabsService.generateSpeech(body.text);
    const outputDir = path.join(env.mediaRoot, body.projectId, "audio");
    await fs.mkdir(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `narration-${randomUUID()}.mp3`);

    if (audioChunks.length === 1) {
      await fs.writeFile(outputPath, audioChunks[0]);
    } else {
      const partPaths = await Promise.all(
        audioChunks.map(async (chunk, index) => {
          const chunkPath = path.join(
            outputDir,
            `narration-part-${index + 1}-${randomUUID()}.mp3`
          );
          await fs.writeFile(chunkPath, chunk);
          return chunkPath;
        })
      );

      await concatAudioFiles(partPaths, outputPath);
      await Promise.all(partPaths.map((filePath) => fs.unlink(filePath).catch(() => undefined)));
    }

    // Upload to Supabase Storage so the file survives ephemeral filesystems.
    const storagePath = `projects/${body.projectId}/audio/${path.basename(outputPath)}`;
    await uploadLocalFile({ localPath: outputPath, objectPath: storagePath, contentType: "audio/mpeg" });

    await db.asset.create({
      data: {
        projectId: body.projectId,
        type: "audio",
        provider: "elevenlabs",
        localPath: outputPath,
        url: storagePath,
        metadataJson: {
          sourceType: "ai_generated",
          model: keys.elevenLabsModel,
          voiceId: keys.elevenLabsVoiceId
        }
      }
    });

    await db.project.update({
      where: { id: body.projectId },
      data: {
        narrationSourceType: "ai_generated",
        status: "ready_to_render"
      }
    });

    return NextResponse.json({ localPath: outputPath, sourceType: "ai_generated" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    if (body?.projectId) {
      await db.project
        .update({ where: { id: body.projectId }, data: { status: "failed" } })
        .catch(() => undefined);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Voice generation failed" },
      { status: 500 }
    );
  }
}
