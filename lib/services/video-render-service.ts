import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { getEnv } from "@/lib/env";
import { getResolution } from "@/lib/ffmpeg/filters";
import type { AspectRatio } from "@/types";

// ---- types ----

export type CameraMotion =
  | "none"
  | "zoomIn"
  | "zoomOut"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown";

export type Transition = "cut" | "fade" | "dissolve";

export interface RenderScene {
  sceneNumber: number;
  subtitle: string;
  durationSec: number;
  /** Absolute local path to a still image (PNG/JPG). */
  imagePath?: string | null;
  /** Absolute local path to a pre-rendered AI video clip for this scene. */
  videoClipPath?: string | null;
  cameraMotion: CameraMotion;
  /** How this scene transitions INTO the next one. Last scene is ignored. */
  transition: Transition;
}

export interface RenderMusicTrack {
  /** Absolute local path to an audio file. */
  path: string;
  /** When in the final timeline this track should START (seconds). Default 0. */
  offsetSec?: number;
  /** Trim N seconds off the start of the source audio. Default 0. */
  trimStartSec?: number;
  /** Max duration this track should play before being cut. Default = until the end. */
  durationSec?: number;
  /** 0–1. Default 0.2. */
  volume?: number;
}

export interface RenderInput {
  projectId: string;
  aspectRatio: AspectRatio;
  scenes: RenderScene[];
  narrationAudioPath: string;
  /**
   * Optional cover / thumbnail still prepended to the timeline as the first
   * few seconds of the rendered video. Narration audio is delayed by
   * `coverDurationSec` so it still lines up with scene 1.
   */
  coverImagePath?: string | null;
  coverDurationSec?: number; // default 3
  /** @deprecated use `musicTracks` for multi-track support */
  musicPath?: string | null;
  /** @deprecated use `musicTracks[*].volume` */
  musicVolume?: number;
  /** Multiple layered music / SFX tracks. Each mixed under narration via amix. */
  musicTracks?: RenderMusicTrack[];
  narrationVolume?: number;
  subtitlesPath?: string;
  includeSubtitles?: boolean;
  outputFileName?: string;
  /** Big on-screen hook shown for the first ~3s of the video. Empty = skip. */
  hookText?: string | null;
  /** Compress the output (smaller file for social upload) at a small quality cost. */
  compressForUpload?: boolean;
}

// ---- escaping ----

function escFilter(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function escDrawtext(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function pickSystemFont() {
  // macOS, most Linux installs, otherwise a generic fallback.
  return (
    process.env.STORYFLOW_FONT_PATH ??
    "/System/Library/Fonts/Supplemental/Arial.ttf"
  );
}

/**
 * Builds a drawtext overlay that shows a large hook title during the first
 * few seconds. Positioned upper-third with a semi-opaque background for
 * readability against any still/video background. Handles multi-line text
 * by splitting on newlines.
 */
function buildHookDrawtext(hookText: string, width: number, height: number) {
  const fontPath = pickSystemFont();
  const lines = hookText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const fontSize = Math.round(Math.min(width, height) * 0.07); // scales with canvas
  const lineGap = Math.round(fontSize * 1.35);

  // Show for first 3 seconds with a quick fade-out in the last 0.4s.
  const baseEnable = `between(t,0,3)`;
  const alphaExpr = `if(lt(t,2.6),1,max(0,1-(t-2.6)/0.4))`;

  return lines
    .map((line, idx) => {
      const y = Math.round(height * 0.12 + idx * lineGap);
      const text = escDrawtext(line);
      return (
        `drawtext=fontfile='${escFilter(fontPath)}':text='${text}':` +
        `fontcolor=white:fontsize=${fontSize}:` +
        `bordercolor=black:borderw=6:` +
        `box=1:boxcolor=black@0.55:boxborderw=24:` +
        `x=(w-text_w)/2:y=${y}:` +
        `alpha='${alphaExpr}':enable='${baseEnable}'`
      );
    })
    .join(",");
}

// ---- per-scene filter builder ----

const FPS = 30;

function buildZoompan(motion: CameraMotion, durationSec: number, width: number, height: number) {
  const frames = Math.max(1, Math.round(durationSec * FPS));
  const base = `d=${frames}:s=${width}x${height}:fps=${FPS}`;

  // Motion expressed as linear progress 0→1 across the scene so short scenes
  // still show the full animation arc. Zoom range 1.0 → 1.35 is clearly
  // visible without distorting composition.
  const t = `on/${frames}`; // progress 0..1
  const centerX = `iw/2-(iw/zoom/2)`;
  const centerY = `ih/2-(ih/zoom/2)`;

  switch (motion) {
    case "zoomIn":
      return `zoompan=z='1+0.35*${t}':x='${centerX}':y='${centerY}':${base}`;
    case "zoomOut":
      return `zoompan=z='1.35-0.35*${t}':x='${centerX}':y='${centerY}':${base}`;
    case "panLeft":
      // Camera appears to pan left → source x starts far right, ends at left.
      return `zoompan=z=1.25:x='(iw-iw/zoom)*(1-${t})':y='${centerY}':${base}`;
    case "panRight":
      return `zoompan=z=1.25:x='(iw-iw/zoom)*(${t})':y='${centerY}':${base}`;
    case "panUp":
      return `zoompan=z=1.25:x='${centerX}':y='(ih-ih/zoom)*(1-${t})':${base}`;
    case "panDown":
      return `zoompan=z=1.25:x='${centerX}':y='(ih-ih/zoom)*(${t})':${base}`;
    case "none":
    default:
      return `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
  }
}

function buildSceneFilter(
  scene: RenderScene,
  inputIndex: number,
  outLabel: string,
  width: number,
  height: number
): string {
  const dur = Math.max(0.5, scene.durationSec);

  if (scene.videoClipPath) {
    // AI video clip — pad/scale to canvas, enforce FPS, trim to scene duration.
    // The trailing `fps=${FPS}` after setpts is critical: xfade requires
    // constant-frame-rate streams with well-defined timestamps. Without it,
    // FFmpeg reports "inputs needs to be a constant frame rate; current rate
    // of 1/0 is invalid".
    return (
      `[${inputIndex}:v]` +
      `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
      `setsar=1,fps=${FPS},trim=duration=${dur},setpts=PTS-STARTPTS,fps=${FPS}` +
      `[${outLabel}]`
    );
  }

  // Still image path. Oversample so zoompan doesn't pixelate on zoom-in.
  const zoom = buildZoompan(scene.cameraMotion, dur, width, height);
  return (
    `[${inputIndex}:v]` +
    `scale=${width * 2}:${height * 2}:force_original_aspect_ratio=increase,` +
    `crop=${width * 2}:${height * 2},` +
    `${zoom},setsar=1,trim=duration=${dur},setpts=PTS-STARTPTS,fps=${FPS}` +
    `[${outLabel}]`
  );
}

function xfadeType(t: Transition) {
  if (t === "dissolve") return "dissolve";
  if (t === "fade") return "fade";
  return "fade"; // for "cut" we use a very short xfade which reads as instant
}

function xfadeDuration(t: Transition) {
  // Visible fade/dissolve, near-instant for "cut".
  return t === "cut" ? 0.05 : 0.9;
}

// ---- service ----

export class VideoRenderService {
  private env = getEnv();

  async renderProject(input: RenderInput): Promise<string> {
    const outputDir = path.resolve(this.env.mediaRoot, input.projectId, "renders");
    await fs.mkdir(outputDir, { recursive: true });

    const outputPath = path.join(outputDir, input.outputFileName ?? "final.mp4");
    const { width, height } = getResolution(input.aspectRatio);

    if (!input.scenes.length) {
      throw new Error("Render requires at least one scene");
    }

    // If a cover image is provided, prepend it as an extra "scene 0" with a
    // default 3-second zoom-in. Audio stays aligned by delaying the narration
    // start below.
    const coverDur = Math.max(1, input.coverDurationSec ?? 3);
    const scenesWithCover: RenderScene[] = input.coverImagePath
      ? [
          {
            sceneNumber: 0,
            subtitle: "",
            durationSec: coverDur,
            imagePath: input.coverImagePath,
            videoClipPath: null,
            cameraMotion: "zoomIn",
            transition: "fade"
          },
          ...input.scenes
        ]
      : input.scenes;
    const narrationDelaySec = input.coverImagePath ? coverDur : 0;

    // ---- assemble FFmpeg args ----
    const args: string[] = ["-y"];

    // Video inputs: one per scene, either a looped still image or an AI clip.
    scenesWithCover.forEach((scene) => {
      if (scene.videoClipPath) {
        args.push("-i", path.resolve(scene.videoClipPath));
      } else if (scene.imagePath) {
        args.push("-loop", "1", "-t", String(Math.max(0.5, scene.durationSec)), "-i", path.resolve(scene.imagePath));
      } else {
        throw new Error(`Scene ${scene.sceneNumber} has no image or video clip`);
      }
    });

    // Audio input(s). Narration input index == number of video inputs.
    const narrationInputIdx = scenesWithCover.length;
    args.push("-i", path.resolve(input.narrationAudioPath));

    // Collect all music / SFX tracks (new API + legacy single musicPath).
    const musicTracks: RenderMusicTrack[] = [
      ...(input.musicTracks ?? []),
      ...(input.musicPath
        ? [
            {
              path: input.musicPath,
              volume: input.musicVolume ?? 0.2,
              offsetSec: 0,
              trimStartSec: 0
            } as RenderMusicTrack
          ]
        : [])
    ];

    const musicInputStart = narrationInputIdx + 1;
    for (const t of musicTracks) {
      args.push("-i", path.resolve(t.path));
    }

    // ---- filter_complex ----
    const videoFilters: string[] = [];

    // Per-scene streams → [v0], [v1], ...
    scenesWithCover.forEach((scene, i) => {
      videoFilters.push(buildSceneFilter(scene, i, `v${i}`, width, height));
    });

    // Chain transitions using xfade. Cumulative offset = sum(scene durations) - sum(transitions so far).
    let chainLabel = "v0";
    let offset = 0;
    if (scenesWithCover.length > 1) {
      for (let i = 0; i < scenesWithCover.length - 1; i += 1) {
        const current = scenesWithCover[i];
        const next = scenesWithCover[i + 1];
        const xt = xfadeType(current.transition);
        const xd = xfadeDuration(current.transition);
        offset += current.durationSec - xd; // transition starts this much before the next scene
        const outLabel = i === scenesWithCover.length - 2 ? "vconcat" : `vx${i}`;
        videoFilters.push(
          `[${chainLabel}][v${i + 1}]xfade=transition=${xt}:duration=${xd}:offset=${offset.toFixed(3)}[${outLabel}]`
        );
        chainLabel = outLabel;
        void next;
      }
    } else {
      videoFilters.push(`[v0]null[vconcat]`);
    }

    // Subtitles (optional). Prefer libass; we don't inline drawtext fallback here
    // to keep the graph readable — modern FFmpeg builds support libass.
    let videoOut = "vconcat";
    if (input.includeSubtitles !== false && input.subtitlesPath) {
      const subPath = escFilter(path.resolve(input.subtitlesPath));
      videoFilters.push(`[vconcat]subtitles=filename='${subPath}'[vsub]`);
      videoOut = "vsub";
    }

    // Hook title overlay (big on-screen text for first ~3s).
    if (input.hookText && input.hookText.trim()) {
      const hookFilter = buildHookDrawtext(input.hookText.trim(), width, height);
      if (hookFilter) {
        videoFilters.push(`[${videoOut}]${hookFilter}[vhook]`);
        videoOut = "vhook";
      }
    }

    // Audio: narration + N optional music / SFX tracks, each with its own
    // offset + trim + volume, all mixed with amix. If we're prepending a
    // cover intro, the narration gets delayed by exactly the cover duration
    // so scene-1 narration lines up with its scene's video frames.
    const narrationVol = input.narrationVolume ?? 1.0;
    const narrationDelayMs = Math.round(narrationDelaySec * 1000);
    const narrationChain =
      narrationDelayMs > 0
        ? `[${narrationInputIdx}:a]volume=${narrationVol},adelay=${narrationDelayMs}|${narrationDelayMs}[anar]`
        : `[${narrationInputIdx}:a]volume=${narrationVol}[anar]`;
    const audioFilters: string[] = [narrationChain];
    let audioOut = "anar";

    if (musicTracks.length > 0) {
      const mixLabels: string[] = ["anar"];
      musicTracks.forEach((t, i) => {
        const inputIdx = musicInputStart + i;
        const label = `m${i}`;
        const vol = Math.max(0, Math.min(1, t.volume ?? 0.2));
        const trim = Math.max(0, t.trimStartSec ?? 0);
        const offset = Math.max(0, t.offsetSec ?? 0);
        const durationPart = t.durationSec && t.durationSec > 0 ? `:duration=${t.durationSec}` : "";
        const delayMs = Math.round(offset * 1000);

        // atrim → shifts internal "start" by trim (drops leading seconds).
        // asetpts resets timestamps to 0 so adelay works correctly.
        // adelay pushes the track to start at `offset` seconds on the final timeline.
        audioFilters.push(
          `[${inputIdx}:a]atrim=start=${trim}${durationPart},` +
            `asetpts=PTS-STARTPTS,` +
            `adelay=${delayMs}|${delayMs},` +
            `volume=${vol}` +
            `[${label}]`
        );
        mixLabels.push(label);
      });

      audioFilters.push(
        `[${mixLabels.join("][")}]amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0:normalize=0[aout]`
      );
      audioOut = "aout";
    }

    const filterComplex = [...videoFilters, ...audioFilters].join(";");

    // Two encoding presets:
    //   default  → medium preset, CRF 20, ~higher quality, bigger file
    //   compress → slow preset, CRF 23, tune film, much smaller file for
    //              social upload. Quality still very good for 1080p talking-head
    //              style content (close to what HandBrake's "Fast 1080p30" outputs).
    const encodeArgs = input.compressForUpload
      ? [
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-preset", "slow",
          "-crf", "23",
          "-tune", "film",
          "-profile:v", "high",
          "-movflags", "+faststart",
          "-c:a", "aac",
          "-b:a", "128k"
        ]
      : [
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          "-preset", "medium",
          "-crf", "20",
          "-movflags", "+faststart",
          "-c:a", "aac"
        ];

    args.push(
      "-filter_complex",
      filterComplex,
      "-map",
      `[${videoOut}]`,
      "-map",
      `[${audioOut}]`,
      ...encodeArgs,
      "-r",
      String(FPS),
      "-shortest",
      outputPath
    );

    await this.runFfmpeg(args);
    return outputPath;
  }

  private async runFfmpeg(args: string[]) {
    return new Promise<void>((resolve, reject) => {
      const child = spawn(this.env.ffmpegPath, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stdout.on("data", (c) => process.stdout.write(c));
      child.stderr.on("data", (c) => {
        const t = c.toString();
        stderr += t;
        process.stderr.write(c);
      });
      child.on("close", (code) => {
        if (code !== 0) return reject(new Error(stderr.slice(-2000) || `FFmpeg exited ${code}`));
        resolve();
      });
    });
  }
}
