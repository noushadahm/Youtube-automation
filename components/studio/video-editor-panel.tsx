"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Scissors,
  Trash2,
  ArrowUp,
  ArrowDown,
  Music2,
  Mic2,
  ImageIcon,
  Type,
  Film,
  Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/store/editor-store";
import { formatDuration } from "@/lib/utils";

type SceneData = {
  id: string;
  order: number;
  narrationText?: string;
  subtitleText: string;
  durationSec: number;
  imageUrl: string | null;
  cameraMotion?: string;
  transition?: string;
};

type AssetData = {
  id: string;
  type: string;
  createdAt: string | Date;
  metadataJson?: unknown;
  sceneId?: string | null;
};

interface VideoEditorPanelProps {
  project: {
    id: string;
    title: string;
    hookText?: string;
    aspectRatio?: string;
    assets?: AssetData[];
    scenes: SceneData[];
  } | null;
}

type SelectedItem =
  | { type: "scene"; id: string }
  | { type: "hook" }
  | { type: "narration" }
  | { type: "music"; id: string }
  | { type: "cover" }
  | null;

interface MusicTrackData {
  id: string;
  createdAt: string | Date;
  metadataJson?: unknown;
}

const MIN_PX_PER_SEC = 20;
const MAX_PX_PER_SEC = 120;
const DEFAULT_ZOOM = 40;

export function VideoEditorPanel({ project }: VideoEditorPanelProps) {
  const router = useRouter();
  const {
    aspectRatio,
    narrationVolume,
    musicVolume,
    setAspectRatio,
    setNarrationVolume,
    setMusicVolume
  } = useEditorStore();

  const [draftDurations, setDraftDurations] = useState<Record<string, number>>({});
  const [musicDraft, setMusicDraft] = useState<
    Record<
      string,
      { offsetSec: number; trimStartSec: number; durationSec: number }
    >
  >({});
  const [message, setMessage] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState<string | null>(null);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [generateSrt, setGenerateSrt] = useState(true);
  const [compressForUpload, setCompressForUpload] = useState(false);
  const [includeCover, setIncludeCover] = useState(true);
  const [coverDurationSec, setCoverDurationSec] = useState(3);
  const [hookText, setHookText] = useState<string>(project?.hookText ?? "");
  const [savingHook, setSavingHook] = useState(false);
  const [stylePrompt, setStylePrompt] = useState<string>(
    (project as { imageStylePrompt?: string } | null)?.imageStylePrompt ?? ""
  );
  const [savingStyle, setSavingStyle] = useState(false);
  const [uploadingMusic, setUploadingMusic] = useState(false);
  const [generatingSrt, setGeneratingSrt] = useState(false);
  const [savingSceneId, setSavingSceneId] = useState<string | null>(null);
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // One <audio> element per music track — each one gets play/pause gated to
  // its offsetSec..offsetSec+durationSec window so playback in the preview
  // matches the final rendered mix.
  const musicRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const timelineRef = useRef<HTMLDivElement | null>(null);

  // --- Asset lookups ---
  const audioAssets = useMemo(
    () =>
      (project?.assets?.filter((a) => a.type === "audio") ?? []).sort(
        (a, b) =>
          new Date(a.createdAt as string).getTime() -
          new Date(b.createdAt as string).getTime()
      ),
    [project]
  );
  const audioAsset = audioAssets[0]; // "main" narration (drives playback sync)
  const musicAssets = useMemo(
    () => (project?.assets?.filter((a) => a.type === "music") ?? []) as MusicTrackData[],
    [project]
  );
  // Helper to read a single track's metadata with sensible defaults.
  function trackMeta(asset: MusicTrackData) {
    const meta = (asset.metadataJson as Record<string, unknown> | null) ?? {};
    return {
      offsetSec: typeof meta.offsetSec === "number" ? (meta.offsetSec as number) : 0,
      trimStartSec:
        typeof meta.trimStartSec === "number" ? (meta.trimStartSec as number) : 0,
      durationSec:
        typeof meta.durationSec === "number" ? (meta.durationSec as number) : null,
      volume: typeof meta.volume === "number" ? (meta.volume as number) : 0.2,
      label: typeof meta.label === "string" ? (meta.label as string) : "Music"
    };
  }
  // Backwards-compat single-asset reference kept for existing upload button.
  const musicAsset = musicAssets[0];
  const subtitleAsset = useMemo(
    () => project?.assets?.find((a) => a.type === "subtitle"),
    [project]
  );
  const finalVideoAsset = useMemo(
    () =>
      project?.assets?.find(
        (a) =>
          a.type === "video" &&
          ((a.metadataJson as { kind?: string } | null)?.kind ?? "final") !== "scene-clip"
      ),
    [project]
  );
  const coverAsset = useMemo(
    () =>
      project?.assets?.find(
        (a) =>
          a.type === "image" &&
          (a.metadataJson as { kind?: string } | null)?.kind === "cover"
      ),
    [project]
  );
  const [generatingCover, setGeneratingCover] = useState(false);
  const [coverPromptOverride, setCoverPromptOverride] = useState("");

  // Cover intro takes up the first N seconds of the preview when the user
  // has it toggled on AND the project actually has a cover asset. When
  // present, narration + scene timeline shift by exactly this much so the
  // preview matches what the renderer will produce.
  const coverPreviewDur =
    coverAsset && includeCover ? Math.max(0, coverDurationSec) : 0;

  // --- Timeline math ---
  const sceneTimeline = useMemo(() => {
    let cursor = coverPreviewDur;
    return (project?.scenes ?? []).map((scene) => {
      const duration = draftDurations[scene.id] ?? scene.durationSec;
      const startSec = cursor;
      cursor += duration;
      return {
        ...scene,
        startSec,
        endSec: cursor,
        effectiveDurationSec: duration
      };
    });
  }, [draftDurations, project, coverPreviewDur]);

  const totalDuration = useMemo(() => {
    const sceneSum = sceneTimeline.reduce((s, sc) => s + sc.effectiveDurationSec, 0);
    return Math.max(sceneSum + coverPreviewDur, audioDuration + coverPreviewDur, 1);
  }, [sceneTimeline, audioDuration, coverPreviewDur]);

  const pxPerSec = zoom;
  const timelineWidth = Math.max(800, totalDuration * pxPerSec);

  /** True while the playhead is in the cover-intro region. */
  const inCoverIntro = coverPreviewDur > 0 && currentTime < coverPreviewDur;

  const activeScene = useMemo(() => {
    if (inCoverIntro) return null;
    return (
      sceneTimeline.find((s) => currentTime >= s.startSec && currentTime < s.endSec) ??
      sceneTimeline[0] ??
      null
    );
  }, [currentTime, sceneTimeline, inCoverIntro]);

  // Live Ken-Burns transform for the preview, mirroring what the render will
  // produce via FFmpeg zoompan. Drives from audio currentTime so it stays in
  // sync with playback and scrubs correctly when you drag the timeline.
  const previewTransform = useMemo(() => {
    if (!activeScene) return "scale(1)";
    const local = Math.max(
      0,
      Math.min(1, (currentTime - activeScene.startSec) / activeScene.effectiveDurationSec)
    );
    const motion = (activeScene as SceneData).cameraMotion ?? "zoomIn";
    switch (motion) {
      case "zoomIn":
        return `scale(${1 + 0.35 * local})`;
      case "zoomOut":
        return `scale(${1.35 - 0.35 * local})`;
      case "panLeft":
        return `scale(1.25) translate(${(0.5 - local) * 10}%, 0%)`;
      case "panRight":
        return `scale(1.25) translate(${(local - 0.5) * 10}%, 0%)`;
      case "panUp":
        return `scale(1.25) translate(0%, ${(0.5 - local) * 10}%)`;
      case "panDown":
        return `scale(1.25) translate(0%, ${(local - 0.5) * 10}%)`;
      case "none":
      default:
        return "scale(1)";
    }
  }, [activeScene, currentTime]);

  // Cross-fade between the active scene and the *next* one in the last ~0.9s
  // of each scene, matching the FFmpeg xfade timing.
  const nextScene = useMemo(() => {
    if (!activeScene) return null;
    return sceneTimeline[activeScene.order] ?? null; // order is 1-based; idx==order gives the next
  }, [activeScene, sceneTimeline]);

  const transitionOpacity = useMemo(() => {
    if (!activeScene || !nextScene) return 0;
    const transition = (activeScene as SceneData).transition ?? "fade";
    const dur = transition === "cut" ? 0.05 : 0.9;
    const remaining = activeScene.endSec - currentTime;
    if (remaining > dur) return 0;
    return Math.max(0, Math.min(1, 1 - remaining / dur));
  }, [activeScene, nextScene, currentTime]);

  const selectedScene = useMemo(() => {
    if (selected?.type !== "scene") return null;
    return sceneTimeline.find((s) => s.id === selected.id) ?? null;
  }, [selected, sceneTimeline]);

  // --- Effects ---
  useEffect(() => {
    setDraftDurations(
      Object.fromEntries(
        (project?.scenes ?? []).map((s) => [s.id, s.durationSec])
      )
    );
  }, [project]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = narrationVolume / 100;
  }, [narrationVolume]);

  // Narration sync: narration is silent during the cover intro, then tracks
  // `currentTime - coverPreviewDur`. Mirrors the renderer's adelay on
  // narration when a cover is prepended.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (inCoverIntro) {
      if (!audio.paused) audio.pause();
      audio.currentTime = 0;
      return;
    }
    const target = currentTime - coverPreviewDur;
    if (Math.abs(audio.currentTime - target) > 0.3) {
      audio.currentTime = Math.max(0, target);
    }
    if (isPlaying && audio.paused) {
      void audio.play().catch(() => undefined);
    }
  }, [currentTime, isPlaying, inCoverIntro, coverPreviewDur]);

  // Per-track music sync: every frame while playing (or whenever currentTime
  // changes when scrubbing), make each music track match what the renderer
  // would produce: play only within its window, start from trimStartSec, and
  // pause (instead of looping) the moment its window ends.
  useEffect(() => {
    for (const m of musicAssets) {
      const audio = musicRefs.current.get(m.id);
      if (!audio) continue;
      const meta = trackMeta(m);
      const offset = meta.offsetSec;
      const duration = meta.durationSec ?? Math.max(1, totalDuration - offset);
      const inWindow =
        currentTime >= offset && currentTime < offset + duration;
      audio.volume = Math.max(0, Math.min(1, meta.volume));

      if (inWindow && isPlaying) {
        const target = currentTime - offset + meta.trimStartSec;
        if (Math.abs(audio.currentTime - target) > 0.3) {
          audio.currentTime = target;
        }
        if (audio.paused) {
          void audio.play().catch(() => undefined);
        }
      } else {
        if (!audio.paused) audio.pause();
      }
    }
  }, [currentTime, isPlaying, musicAssets, totalDuration]);

  // Master clock — driven by rAF rather than any single audio element, so
  // cover-intro silence advances properly and preview timing matches the
  // renderer bit-for-bit. Narration + all music tracks are seeked TO this
  // clock, never the reverse.
  useEffect(() => {
    if (!isPlaying) return;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const deltaSec = (now - last) / 1000;
      last = now;
      setCurrentTime((prev) => {
        const next = prev + deltaSec;
        if (next >= totalDuration) {
          // End of timeline — auto-pause.
          setIsPlaying(false);
          audioRef.current?.pause();
          for (const el of musicRefs.current.values()) {
            if (!el.paused) el.pause();
          }
          return totalDuration;
        }
        return next;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, totalDuration]);

  // --- Keyboard shortcuts (active when the editor has focus and user isn't typing) ---
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const editing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable;
      if (editing) return;

      const selectedSceneId =
        selected?.type === "scene" ? selected.id : activeScene?.id ?? null;

      if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seekTo(currentTime - (e.shiftKey ? 10 : 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seekTo(currentTime + (e.shiftKey ? 10 : 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        seekTo(0);
      } else if (e.key === "End") {
        e.preventDefault();
        seekTo(totalDuration);
      } else if (e.key === "s" || e.key === "S") {
        if (selected?.type === "music") {
          e.preventDefault();
          void splitMusicTrackAtPlayhead(selected.id);
        } else if (selectedSceneId) {
          e.preventDefault();
          void splitSceneAtPlayhead(selectedSceneId);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        if (selected?.type === "scene") {
          e.preventDefault();
          void deleteScene(selected.id);
        }
      } else if (e.key === "[") {
        if (selectedSceneId) {
          e.preventDefault();
          void moveSceneOrder(selectedSceneId, -1);
        }
      } else if (e.key === "]") {
        if (selectedSceneId) {
          e.preventDefault();
          void moveSceneOrder(selectedSceneId, 1);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, currentTime, totalDuration, sceneTimeline, activeScene]);

  // --- Transport ---
  function togglePlay() {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      void audioRef.current.play();
      setIsPlaying(true);
      // The per-track sync effect will start any music tracks whose window
      // covers the current playhead time.
    } else {
      audioRef.current.pause();
      for (const el of musicRefs.current.values()) {
        if (!el.paused) el.pause();
      }
      setIsPlaying(false);
    }
  }
  function seekTo(sec: number) {
    const clamped = Math.max(0, Math.min(totalDuration, sec));
    if (audioRef.current) audioRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    // Music re-alignment happens in the sync effect on the next tick.
  }
  function skip(deltaSec: number) {
    seekTo(currentTime + deltaSec);
  }

  function onTimeUpdate() {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
  }
  function onLoadedMetadata() {
    if (!audioRef.current) return;
    setAudioDuration(audioRef.current.duration || 0);
  }

  // --- Scene edits ---
  async function deleteScene(sceneId: string) {
    if (!project) return;
    if (!confirm("Delete this scene? Its narration and image will be lost.")) return;
    setSavingSceneId(sceneId);
    try {
      const res = await fetch(`/api/projects/${project.id}/scenes/${sceneId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      setSelected(null);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setSavingSceneId(null);
    }
  }

  async function splitSceneAtPlayhead(sceneId: string) {
    if (!project) return;
    const scene = sceneTimeline.find((s) => s.id === sceneId);
    if (!scene) return;
    // Compute the split fraction based on where the playhead sits inside the scene.
    const intoScene = Math.max(0.1, Math.min(0.9, (currentTime - scene.startSec) / scene.effectiveDurationSec));
    setSavingSceneId(sceneId);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/scenes/${sceneId}/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fraction: intoScene })
        }
      );
      if (!res.ok) throw new Error((await res.json())?.error ?? "Split failed");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Split failed");
    } finally {
      setSavingSceneId(null);
    }
  }

  async function moveSceneOrder(sceneId: string, delta: -1 | 1) {
    if (!project) return;
    const scene = project.scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    const newOrder = scene.order + delta;
    if (newOrder < 1 || newOrder > project.scenes.length) return;
    await patchScene(sceneId, { order: newOrder });
  }

  /**
   * Drag the right edge of a scene clip to resize its duration.
   * Updates the local draft instantly for smooth feedback, then commits on
   * mouseup via PATCH. Minimum duration 0.5s.
   */
  function startTrim(sceneId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const scene = sceneTimeline.find((s) => s.id === sceneId);
    if (!scene) return;
    const startDuration = draftDurations[sceneId] ?? scene.effectiveDurationSec;

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const nextDur = Math.max(0.5, startDuration + dx / pxPerSec);
      setDraftDurations((d) => ({ ...d, [sceneId]: Number(nextDur.toFixed(2)) }));
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDraftDurations((current) => {
        const finalDur = current[sceneId];
        if (finalDur != null && Math.abs(finalDur - startDuration) > 0.05) {
          void patchScene(sceneId, { durationSec: finalDur });
        }
        return current;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  /**
   * Replace (or attach) a still image on a scene by uploading a file.
   */
  async function uploadSceneImage(sceneId: string, file: File) {
    if (!project) return;
    setSavingSceneId(sceneId);
    try {
      const fd = new FormData();
      fd.append("sceneId", sceneId);
      fd.append("file", file);
      const res = await fetch(`/api/projects/${project.id}/images/upload`, {
        method: "POST",
        body: fd
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Upload failed");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setSavingSceneId(null);
    }
  }

  /**
   * Handle file drop anywhere on the preview: drop an image -> upload for the
   * currently-active scene.
   */
  async function handlePreviewDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !activeScene) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Drop an image file to replace this scene's picture.");
      return;
    }
    await uploadSceneImage(activeScene.id, file);
  }

  // ---- Upload an image FROM LOCAL DEVICE → insert as new scene ----
  const [uploadingNewScene, setUploadingNewScene] = useState(false);

  async function addSceneFromLocalImage(file: File, durationSec = 4) {
    if (!project) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Please choose an image file.");
      return;
    }
    setUploadingNewScene(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("duration", String(durationSec));
      const res = await fetch(`/api/projects/${project.id}/scenes/from-image`, {
        method: "POST",
        body: fd
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to add scene");
      setMessage(`Scene ${payload.scene?.order ?? ""} added from your image.`);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingNewScene(false);
    }
  }

  /**
   * Drop an image file anywhere on the timeline → insert as a NEW scene.
   * A video / audio file dropped here isn't handled (we'd need a different
   * flow — for now it no-ops).
   */
  async function handleTimelineDrop(e: React.DragEvent) {
    const files = Array.from(e.dataTransfer.files ?? []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    const audios = files.filter((f) => f.type.startsWith("audio/"));
    if (images.length === 0 && audios.length === 0) return;
    e.preventDefault();
    if (!project) return;

    // Images → new scenes at the end.
    for (const img of images) {
      try {
        const fd = new FormData();
        fd.append("file", img);
        fd.append("duration", "4");
        const res = await fetch(`/api/projects/${project.id}/scenes/from-image`, {
          method: "POST",
          body: fd
        });
        if (!res.ok) throw new Error((await res.json())?.error ?? "Add scene failed");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to add scene from image");
      }
    }

    // Audio → new music track.
    for (const audio of audios) {
      try {
        const fd = new FormData();
        fd.append("file", audio);
        fd.append("volume", "0.2");
        const res = await fetch(`/api/projects/${project.id}/music/upload`, {
          method: "POST",
          body: fd
        });
        if (!res.ok) throw new Error((await res.json())?.error ?? "Add music failed");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to add music track");
      }
    }

    router.refresh();
  }

  // --- Drag-reorder scenes on the timeline ---
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  // Which scene thumbnail / timeline clip is currently hovered during a FILE drag?
  // Used to show a "drop image here" highlight.
  const [fileDropTargetId, setFileDropTargetId] = useState<string | null>(null);

  /**
   * Shared handler: when an image file is dropped on a specific scene, upload
   * it and replace the scene image. Swallows the event so other drop zones
   * don't also react.
   */
  async function handleSceneFileDrop(
    sceneId: string,
    e: React.DragEvent<HTMLElement>
  ) {
    if (!e.dataTransfer.types.includes("Files")) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    e.preventDefault();
    e.stopPropagation();
    setFileDropTargetId(null);
    if (!file.type.startsWith("image/")) {
      setMessage("Drop an image file to replace this scene's picture.");
      return;
    }
    await uploadSceneImage(sceneId, file);
  }

  function handleSceneFileDragOver(
    sceneId: string,
    e: React.DragEvent<HTMLElement>
  ) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setFileDropTargetId(sceneId);
  }

  function handleSceneFileDragLeave(sceneId: string) {
    setFileDropTargetId((current) => (current === sceneId ? null : current));
  }

  async function reorderToPosition(sceneId: string, targetSceneId: string) {
    if (!project || sceneId === targetSceneId) return;
    const target = project.scenes.find((s) => s.id === targetSceneId);
    if (!target) return;
    await patchScene(sceneId, { order: target.order });
  }

  // --- Music track updates ---
  async function patchMusicTrack(assetId: string, patch: Record<string, unknown>) {
    if (!project) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/music/${assetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Update failed");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed");
    }
  }

  async function splitMusicTrackAtPlayhead(assetId: string) {
    if (!project) return;
    try {
      const res = await fetch(
        `/api/projects/${project.id}/music/${assetId}/split`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ atSec: currentTime })
        }
      );
      if (!res.ok) throw new Error((await res.json())?.error ?? "Split failed");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Split failed");
    }
  }

  async function deleteMusicTrack(assetId: string) {
    if (!project) return;
    if (!confirm("Remove this audio track?")) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/music/${assetId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Delete failed");
      setSelected(null);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Delete failed");
    }
  }

  /**
   * Drag right edge of a music clip to change its playback duration.
   * Drag left edge to trim the start (source offset).
   * Drag middle to shift the clip's position on the timeline (offsetSec).
   */
  function startMusicEdit(
    assetId: string,
    mode: "trimStart" | "trimEnd" | "move",
    e: React.MouseEvent
  ) {
    e.preventDefault();
    e.stopPropagation();
    const asset = musicAssets.find((a) => a.id === assetId);
    if (!asset) return;
    const startX = e.clientX;
    const meta = trackMeta(asset);
    const initial = {
      offsetSec: meta.offsetSec,
      trimStartSec: meta.trimStartSec,
      durationSec: meta.durationSec ?? totalDuration - meta.offsetSec
    };

    function onMove(ev: MouseEvent) {
      const dx = ev.clientX - startX;
      const deltaSec = dx / pxPerSec;
      if (mode === "move") {
        const next = Math.max(0, initial.offsetSec + deltaSec);
        setMusicDraft((d) => ({ ...d, [assetId]: { ...d[assetId], offsetSec: next } }));
      } else if (mode === "trimEnd") {
        const next = Math.max(0.5, initial.durationSec + deltaSec);
        setMusicDraft((d) => ({ ...d, [assetId]: { ...d[assetId], durationSec: next } }));
      } else if (mode === "trimStart") {
        // Trim-start moves both the trimStartSec and the offsetSec together
        // so the clip appears to stay anchored visually on the right edge.
        const next = Math.max(0, initial.trimStartSec + deltaSec);
        const offsetNext = Math.max(0, initial.offsetSec + deltaSec);
        setMusicDraft((d) => ({
          ...d,
          [assetId]: {
            ...d[assetId],
            trimStartSec: next,
            offsetSec: offsetNext,
            durationSec: Math.max(0.5, initial.durationSec - deltaSec)
          }
        }));
      }
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setMusicDraft((current) => {
        const final = current[assetId];
        if (final) {
          const patch: Record<string, unknown> = {};
          if (mode === "move") patch.offsetSec = final.offsetSec;
          else if (mode === "trimEnd") patch.durationSec = final.durationSec;
          else if (mode === "trimStart") {
            patch.offsetSec = final.offsetSec;
            patch.trimStartSec = final.trimStartSec;
            patch.durationSec = final.durationSec;
          }
          void patchMusicTrack(assetId, patch);
        }
        return current;
      });
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  async function patchScene(sceneId: string, patch: Record<string, unknown>) {
    if (!project) return;
    setSavingSceneId(sceneId);
    try {
      const res = await fetch(`/api/projects/${project.id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to update scene");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to update scene");
    } finally {
      setSavingSceneId(null);
    }
  }

  // --- Render flow ---
  async function pollRenderJob(jobId: string) {
    while (true) {
      const res = await fetch(`/api/render-jobs/${jobId}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Render status check failed (${res.status})`);
      const job = (await res.json()) as {
        status: string;
        progress: number;
        errorMessage?: string | null;
      };
      setRenderStatus(job.status);
      setRenderProgress(job.progress);
      if (job.status === "completed") return;
      if (job.status === "failed") throw new Error(job.errorMessage ?? "Render failed");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  async function handleRender() {
    if (!project) return;
    setRendering(true);
    setMessage(null);
    setRenderProgress(0);
    setRenderStatus("queued");
    try {
      const res = await fetch(`/api/projects/${project.id}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aspectRatio,
          includeSubtitles,
          generateSrt,
          hookText,
          compressForUpload,
          includeCover: includeCover && Boolean(coverAsset),
          coverDurationSec
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Render failed");
      await pollRenderJob(payload.renderJobId);
      setMessage("Render completed.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  async function saveStylePrompt() {
    if (!project) return;
    setSavingStyle(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageStylePrompt: stylePrompt })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to save style");
      setMessage("Master style saved. New image/video generations will use it.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save style");
    } finally {
      setSavingStyle(false);
    }
  }

  async function saveHook() {
    if (!project) return;
    setSavingHook(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hookText })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to save hook");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed to save hook");
    } finally {
      setSavingHook(false);
    }
  }

  async function handleMusicUpload(file: File) {
    if (!project) return;
    setUploadingMusic(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("volume", String(musicVolume / 100));
      const res = await fetch(`/api/projects/${project.id}/music/upload`, {
        method: "POST",
        body: fd
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Upload failed");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingMusic(false);
    }
  }

  // ---- Music generation from prompt (ElevenLabs Music) ----
  const [musicPromptOpen, setMusicPromptOpen] = useState(false);
  const [musicPrompt, setMusicPrompt] = useState("");
  const [musicPromptDuration, setMusicPromptDuration] = useState(30);
  const [generatingMusic, setGeneratingMusic] = useState(false);

  async function handleGenerateMusic() {
    if (!project || !musicPrompt.trim()) return;
    setGeneratingMusic(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/music/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: musicPrompt,
          durationSec: musicPromptDuration,
          label: `AI · ${musicPrompt.slice(0, 24)}`
        })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Music generation failed");
      setMusicPromptOpen(false);
      setMusicPrompt("");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Music generation failed");
    } finally {
      setGeneratingMusic(false);
    }
  }

  async function handleMusicRemove() {
    if (!project || !musicAsset) return;
    setUploadingMusic(true);
    try {
      const res = await fetch(
        `/api/projects/${project.id}/music/upload?assetId=${musicAsset.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error((await res.json())?.error ?? "Failed to remove");
      router.refresh();
    } finally {
      setUploadingMusic(false);
    }
  }

  // Upload custom cover from local device (or via drop).
  const [uploadingCover, setUploadingCover] = useState(false);
  const [coverDropActive, setCoverDropActive] = useState(false);

  async function uploadCoverFile(file: File) {
    if (!project) return;
    if (!file.type.startsWith("image/")) {
      setMessage("Cover must be an image file.");
      return;
    }
    setUploadingCover(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/projects/${project.id}/cover/upload`, {
        method: "POST",
        body: fd
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Cover upload failed");
      setMessage("Cover image uploaded.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Cover upload failed");
    } finally {
      setUploadingCover(false);
    }
  }

  async function handleGenerateCover() {
    if (!project) return;
    setGeneratingCover(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: coverPromptOverride.trim() || undefined
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Cover generation failed");
      setMessage("Cover generated.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Cover generation failed");
    } finally {
      setGeneratingCover(false);
    }
  }

  // ---- Auto-shorts generation ----
  const [generatingShorts, setGeneratingShorts] = useState(false);
  const [shortsCount, setShortsCount] = useState(3);
  const [shortsDuration, setShortsDuration] = useState(60);

  async function handleGenerateShorts() {
    if (!project) return;
    setGeneratingShorts(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/shorts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: shortsCount, durationSec: shortsDuration })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Shorts failed");
      setMessage(
        `Generated ${payload.shorts?.length ?? 0} short(s). See them in Exports.`
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Shorts failed");
    } finally {
      setGeneratingShorts(false);
    }
  }

  async function handleGenerateSrt() {
    if (!project) return;
    setGeneratingSrt(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/subtitles`, { method: "POST" });
      if (!res.ok) throw new Error((await res.json())?.error ?? "SRT failed");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "SRT failed");
    } finally {
      setGeneratingSrt(false);
    }
  }

  // --- Timeline interactions ---
  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + timelineRef.current.scrollLeft;
    const sec = x / pxPerSec;
    seekTo(sec);
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 text-sm text-muted-foreground">
        Create or open a project to start editing.
      </div>
    );
  }

  const everySceneHasImage = project.scenes.every((s) => s.imageUrl);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-950 text-sm">
      {/* Hidden audio drivers */}
      {audioAsset ? (
        <audio
          ref={audioRef}
          src={`/api/assets/${audioAsset.id}`}
          onLoadedMetadata={onLoadedMetadata}
          preload="metadata"
        />
      ) : null}
      {/* One gated audio element per music / SFX track — no looping; the
          per-track sync effect above handles play/pause/seek. */}
      {musicAssets.map((m) => (
        <audio
          key={m.id}
          ref={(el) => {
            if (el) musicRefs.current.set(m.id, el);
            else musicRefs.current.delete(m.id);
          }}
          src={`/api/assets/${m.id}`}
          preload="metadata"
        />
      ))}

      {/* ========== TOP BAR ========== */}
      <div className="flex items-center justify-between border-b border-white/10 bg-slate-900/80 px-4 py-2">
        <div className="flex items-center gap-3">
          <Film className="h-5 w-5 text-cyan-300" />
          <div>
            <p className="font-semibold">{project.title}</p>
            <p className="text-xs text-muted-foreground">
              {project.scenes.length} scenes · {formatDuration(totalDuration)} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl border border-white/10 bg-black/20 p-0.5">
            {(["16:9", "9:16"] as const).map((r) => (
              <button
                key={r}
                onClick={() => setAspectRatio(r)}
                className={`rounded-lg px-3 py-1 text-xs ${
                  aspectRatio === r
                    ? "bg-white/15 text-white"
                    : "text-muted-foreground hover:text-white"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <Button
            onClick={handleRender}
            disabled={!everySceneHasImage || !audioAsset || rendering}
            className="min-w-[160px]"
          >
            {rendering
              ? renderStatus === "queued"
                ? "Queued…"
                : `Rendering ${renderProgress}%`
              : "Export MP4"}
          </Button>
        </div>
      </div>

      {/* ========== MAIN 3-COLUMN ========== */}
      <div className="flex flex-1 overflow-hidden">
        {/* ----- LEFT: Media library ----- */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-white/10 bg-slate-900/50">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            Media
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto p-3">
            {/* Scenes group */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <ImageIcon className="h-3 w-3" /> Scenes ({project.scenes.length})
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                {project.scenes.map((scene) => {
                  const isDropTarget = fileDropTargetId === scene.id;
                  const isReorderTarget =
                    dragOverSceneId === scene.id && draggingSceneId && draggingSceneId !== scene.id;
                  return (
                    <div
                      key={scene.id}
                      onClick={() => setSelected({ type: "scene", id: scene.id })}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.effectAllowed = "move";
                        try {
                          e.dataTransfer.setData("text/plain", "scene");
                        } catch {
                          /* noop */
                        }
                        setDraggingSceneId(scene.id);
                      }}
                      onDragEnd={() => {
                        setDraggingSceneId(null);
                        setDragOverSceneId(null);
                      }}
                      onDragOver={(e) => {
                        // Files → replace image
                        if (e.dataTransfer.types.includes("Files")) {
                          handleSceneFileDragOver(scene.id, e);
                          return;
                        }
                        // Scene drag → reorder
                        if (draggingSceneId && draggingSceneId !== scene.id) {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          setDragOverSceneId(scene.id);
                        }
                      }}
                      onDragLeave={() => {
                        handleSceneFileDragLeave(scene.id);
                        setDragOverSceneId((id) => (id === scene.id ? null : id));
                      }}
                      onDrop={async (e) => {
                        if (e.dataTransfer.types.includes("Files")) {
                          await handleSceneFileDrop(scene.id, e);
                          return;
                        }
                        if (draggingSceneId && draggingSceneId !== scene.id) {
                          e.preventDefault();
                          await reorderToPosition(draggingSceneId, scene.id);
                          setDraggingSceneId(null);
                          setDragOverSceneId(null);
                        }
                      }}
                      className={`group relative aspect-video cursor-pointer overflow-hidden rounded-lg border transition ${
                        draggingSceneId === scene.id ? "opacity-40" : ""
                      } ${
                        isDropTarget
                          ? "border-amber-400 ring-2 ring-amber-400"
                          : isReorderTarget
                            ? "border-white ring-2 ring-white"
                            : selectedScene?.id === scene.id
                              ? "border-cyan-400"
                              : "border-white/10 hover:border-white/30"
                      }`}
                    >
                      {scene.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={scene.imageUrl}
                          alt={`Scene ${scene.order}`}
                          className="pointer-events-none h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black/40 text-[10px] text-muted-foreground">
                          no image
                        </div>
                      )}
                      <span className="pointer-events-none absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[10px]">
                        {scene.order}
                      </span>
                      {/* Inline "replace" upload button overlaid on hover */}
                      <label
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/60 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
                      >
                        {savingSceneId === scene.id ? "Uploading…" : "Replace / Upload"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={savingSceneId === scene.id}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void uploadSceneImage(scene.id, f);
                            e.currentTarget.value = "";
                          }}
                        />
                      </label>
                      {isDropTarget ? (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-amber-500/30 text-[10px] font-semibold text-white">
                          Drop to replace
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              {/* Add a fresh scene from a local image */}
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-cyan-400/30 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-200 hover:bg-cyan-500/10">
                {uploadingNewScene ? "Uploading…" : "+ Add image from device (new scene)"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingNewScene}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void addSceneFromLocalImage(f);
                    e.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="mt-1.5 text-[10px] text-muted-foreground">
                Click a thumbnail to <strong>replace</strong> its picture · Click the
                button above (or drop a file on the timeline) to <strong>add a new
                scene</strong> from your device.
              </p>
            </div>

            {/* Audio */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Mic2 className="h-3 w-3" /> Narration
              </p>
              {audioAsset ? (
                <button
                  onClick={() => setSelected({ type: "narration" })}
                  className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-emerald-400/5 px-2 py-1.5 text-left hover:bg-emerald-400/10"
                >
                  <Mic2 className="h-3 w-3 text-emerald-300" />
                  <span className="truncate text-xs">Narration audio</span>
                </button>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Generate or upload in Voice Studio.
                </p>
              )}
            </div>

            {/* Music / audio tracks */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Music2 className="h-3 w-3" /> Audio tracks ({musicAssets.length})
              </p>
              <div className="space-y-1.5">
                {musicAssets.map((m) => {
                  const meta = trackMeta(m);
                  return (
                    <button
                      key={m.id}
                      onClick={() => setSelected({ type: "music", id: m.id })}
                      className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition ${
                        selected?.type === "music" && selected.id === m.id
                          ? "border-violet-400 bg-violet-400/10"
                          : "border-white/10 bg-violet-400/5 hover:bg-violet-400/10"
                      }`}
                    >
                      <Music2 className="h-3 w-3 shrink-0 text-violet-300" />
                      <span className="truncate text-xs">{meta.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {Math.round(meta.volume * 100)}%
                      </span>
                    </button>
                  );
                })}
                <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 px-3 py-2 text-xs text-muted-foreground hover:bg-white/[0.03]">
                  {uploadingMusic
                    ? "Uploading…"
                    : musicAssets.length === 0
                      ? "+ Upload music / SFX"
                      : "+ Upload another track"}
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    disabled={uploadingMusic}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void handleMusicUpload(f);
                    }}
                  />
                </label>

                {/* AI music generation */}
                {musicPromptOpen ? (
                  <div className="space-y-1.5 rounded-lg border border-white/10 bg-black/30 p-2">
                    <textarea
                      className="w-full rounded-md border border-border bg-black/20 px-2 py-1 text-xs"
                      rows={2}
                      placeholder="e.g. cinematic dark orchestral buildup"
                      value={musicPrompt}
                      onChange={(e) => setMusicPrompt(e.target.value)}
                    />
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={10}
                        max={240}
                        value={musicPromptDuration}
                        onChange={(e) => setMusicPromptDuration(Number(e.target.value))}
                        className="w-16 rounded-md border border-border bg-black/20 px-2 py-1 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">sec</span>
                      <button
                        onClick={handleGenerateMusic}
                        disabled={generatingMusic || !musicPrompt.trim()}
                        className="ml-auto rounded-md bg-violet-500 px-2 py-1 text-xs font-semibold text-white hover:bg-violet-400 disabled:opacity-40"
                      >
                        {generatingMusic ? "Composing…" : "Generate"}
                      </button>
                      <button
                        onClick={() => setMusicPromptOpen(false)}
                        className="rounded-md px-1.5 text-xs text-muted-foreground hover:text-white"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setMusicPromptOpen(true)}
                    className="flex w-full items-center justify-center rounded-lg border border-dashed border-violet-400/30 bg-violet-500/5 px-3 py-2 text-xs text-violet-200 hover:bg-violet-500/10"
                  >
                    ✨ Generate music from prompt
                  </button>
                )}

                <p className="text-[10px] text-muted-foreground">
                  Drop audio files on the timeline too. AI music uses your ElevenLabs key.
                </p>
              </div>
            </div>

            {/* Hook */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <Type className="h-3 w-3" /> Title hook
              </p>
              <button
                onClick={() => setSelected({ type: "hook" })}
                className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-amber-400/5 px-2 py-1.5 text-left hover:bg-amber-400/10"
              >
                <Type className="h-3 w-3 text-amber-300" />
                <span className="truncate text-xs">
                  {hookText.trim() ? hookText.slice(0, 30) : "Add a hook…"}
                </span>
              </button>
            </div>

            {/* Cover / Thumbnail */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                <ImageIcon className="h-3 w-3" /> Cover / Thumbnail
              </p>
              <div
                onClick={() => setSelected({ type: "cover" })}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("Files")) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                  setCoverDropActive(true);
                }}
                onDragLeave={() => setCoverDropActive(false)}
                onDrop={(e) => {
                  setCoverDropActive(false);
                  const f = e.dataTransfer.files?.[0];
                  if (!f) return;
                  e.preventDefault();
                  void uploadCoverFile(f);
                }}
                className={`group relative block w-full cursor-pointer overflow-hidden rounded-lg border transition ${
                  coverDropActive
                    ? "border-amber-400 ring-2 ring-amber-400"
                    : selected?.type === "cover"
                      ? "border-cyan-400"
                      : "border-white/10 hover:border-white/30"
                }`}
              >
                {coverAsset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/assets/${coverAsset.id}`}
                    alt="Cover"
                    className="pointer-events-none aspect-video w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-black/30 text-[10px] text-muted-foreground">
                    + Drop / upload / generate cover
                  </div>
                )}
                {/* Hover-reveal upload label */}
                <label
                  onClick={(e) => e.stopPropagation()}
                  className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/70 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100"
                >
                  {uploadingCover ? "Uploading…" : coverAsset ? "Replace / Upload" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCover}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadCoverFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {coverDropActive ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-amber-500/30 text-[10px] font-semibold text-white">
                    Drop to set as cover
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </aside>

        {/* ----- CENTER: Preview + Timeline ----- */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Preview */}
          <div
            className="flex flex-1 items-center justify-center bg-black p-4"
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={handlePreviewDrop}
          >
            <div
              className={`relative flex items-center justify-center overflow-hidden rounded-xl bg-black shadow-2xl ${
                aspectRatio === "9:16" ? "h-full aspect-[9/16]" : "w-full max-w-3xl aspect-video"
              }`}
            >
              {/* Cover intro image — shown only while the playhead is inside
                  the cover region; renders an identical 3s zoom-in so the
                  preview matches the final export. */}
              {inCoverIntro && coverAsset ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/assets/${coverAsset.id}`}
                  alt="Cover intro"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    transform: `scale(${1 + 0.1 * (currentTime / Math.max(coverPreviewDur, 0.1))})`,
                    transformOrigin: "center center",
                    willChange: "transform"
                  }}
                />
              ) : activeScene?.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={activeScene.imageUrl}
                  alt={`Scene ${activeScene.order}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    transform: previewTransform,
                    transformOrigin: "center center",
                    transition: isPlaying
                      ? "none"
                      : "transform 120ms linear",
                    willChange: "transform"
                  }}
                />
              ) : (
                <div className="text-sm text-muted-foreground">
                  No preview — generate scene images first.
                </div>
              )}

              {/* Outgoing scene crossfading into the next one */}
              {nextScene?.imageUrl && transitionOpacity > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={nextScene.imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    opacity: transitionOpacity,
                    transform: "scale(1)",
                    willChange: "opacity"
                  }}
                />
              ) : null}

              {/* Hook overlay in first 3s */}
              {currentTime < 3 && hookText.trim() ? (
                <div
                  className="absolute left-1/2 top-[14%] z-10 -translate-x-1/2 whitespace-pre-wrap rounded-xl bg-black/60 px-6 py-3 text-center text-2xl font-bold text-white shadow-lg backdrop-blur"
                  style={{
                    opacity: currentTime > 2.6 ? Math.max(0, 1 - (currentTime - 2.6) / 0.4) : 1
                  }}
                >
                  {hookText}
                </div>
              ) : null}

              {/* Subtitle */}
              {activeScene?.subtitleText ? (
                <div className="absolute bottom-[8%] left-1/2 z-10 max-w-[80%] -translate-x-1/2 rounded-md bg-black/70 px-4 py-2 text-center text-sm text-white">
                  {activeScene.subtitleText}
                </div>
              ) : null}

              {/* Motion / transition badge (helps confirm effects are applied) */}
              {activeScene ? (
                <div className="absolute left-2 top-2 z-10 flex gap-1 rounded-md bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-cyan-200">
                  <span>{(activeScene as SceneData).cameraMotion ?? "zoomIn"}</span>
                  <span className="text-muted-foreground">•</span>
                  <span>{(activeScene as SceneData).transition ?? "fade"}</span>
                </div>
              ) : null}
            </div>
          </div>

          {/* Transport */}
          <div className="flex items-center justify-between border-t border-white/10 bg-slate-900/80 px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => skip(-5)}
                className="rounded-lg p-2 hover:bg-white/5"
                title="Back 5s"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={togglePlay}
                disabled={!audioAsset}
                className="rounded-lg bg-cyan-400 p-2 text-slate-950 hover:bg-cyan-300 disabled:opacity-40"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </button>
              <button
                onClick={() => skip(5)}
                className="rounded-lg p-2 hover:bg-white/5"
                title="Forward 5s"
              >
                <SkipForward className="h-4 w-4" />
              </button>
            </div>
            <p className="font-mono text-xs text-muted-foreground">
              {formatDuration(currentTime)} / {formatDuration(totalDuration)}
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="hidden lg:block">
                <kbd className="rounded bg-white/10 px-1">space</kbd> play ·{" "}
                <kbd className="rounded bg-white/10 px-1">←/→</kbd> seek ·{" "}
                <kbd className="rounded bg-white/10 px-1">S</kbd> split ·{" "}
                <kbd className="rounded bg-white/10 px-1">[ ]</kbd> reorder ·{" "}
                <kbd className="rounded bg-white/10 px-1">del</kbd> delete
              </span>
              <div className="flex items-center gap-2">
                <span>Zoom</span>
                <input
                  type="range"
                  min={MIN_PX_PER_SEC}
                  max={MAX_PX_PER_SEC}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-24"
                />
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="h-[300px] shrink-0 overflow-hidden border-t border-white/10 bg-slate-950">
            <div
              ref={timelineRef}
              className="relative h-full overflow-x-auto overflow-y-auto"
              onClick={handleTimelineClick}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("Files")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={handleTimelineDrop}
            >
              <div className="relative" style={{ width: timelineWidth }}>
                {/* Ruler */}
                <div className="sticky top-0 z-10 flex h-6 border-b border-white/10 bg-slate-900">
                  {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
                    <div
                      key={i}
                      className="relative shrink-0 border-r border-white/10"
                      style={{ width: pxPerSec }}
                    >
                      {i % 5 === 0 ? (
                        <span className="absolute left-1 top-0.5 text-[10px] text-muted-foreground">
                          {formatDuration(i)}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>

                {/* Tracks */}
                <div className="flex flex-col gap-1 p-1">
                  {coverPreviewDur > 0 && coverAsset ? (
                    <TimelineTrack label="T0 · Cover" color="cyan">
                      <Clip
                        start={0}
                        duration={coverPreviewDur}
                        pxPerSec={pxPerSec}
                        active={selected?.type === "cover"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ type: "cover" });
                        }}
                        color="cyan"
                        image={`/api/assets/${coverAsset.id}`}
                      >
                        <ImageIcon className="mr-1 inline h-3 w-3" />
                        <span className="truncate">Cover ({coverPreviewDur}s)</span>
                      </Clip>
                    </TimelineTrack>
                  ) : null}

                  <TimelineTrack label="T1 · Hook" color="amber">
                    {hookText.trim() ? (
                      <Clip
                        start={0}
                        duration={Math.min(3, totalDuration)}
                        pxPerSec={pxPerSec}
                        active={selected?.type === "hook"}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ type: "hook" });
                        }}
                        color="amber"
                      >
                        <Type className="mr-1 inline h-3 w-3" />
                        <span className="truncate">{hookText}</span>
                      </Clip>
                    ) : null}
                  </TimelineTrack>

                  <TimelineTrack label="V1 · Scenes" color="cyan">
                    {sceneTimeline.map((s) => (
                      <Clip
                        key={s.id}
                        start={s.startSec}
                        duration={s.effectiveDurationSec}
                        pxPerSec={pxPerSec}
                        active={selected?.type === "scene" && selected.id === s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelected({ type: "scene", id: s.id });
                        }}
                        color="cyan"
                        image={s.imageUrl ?? undefined}
                        resizable
                        onTrimStart={(e) => startTrim(s.id, e)}
                        onDelete={(e) => {
                          e.stopPropagation();
                          void deleteScene(s.id);
                        }}
                        draggable
                        dragging={draggingSceneId === s.id}
                        dragOver={
                          (dragOverSceneId === s.id && draggingSceneId !== s.id) ||
                          fileDropTargetId === s.id
                        }
                        onDragStartClip={() => setDraggingSceneId(s.id)}
                        onDragOverClip={() => setDragOverSceneId(s.id)}
                        onDragLeaveClip={() => setDragOverSceneId((id) => (id === s.id ? null : id))}
                        onDropClip={async () => {
                          if (draggingSceneId && draggingSceneId !== s.id) {
                            await reorderToPosition(draggingSceneId, s.id);
                          }
                          setDraggingSceneId(null);
                          setDragOverSceneId(null);
                        }}
                        onDragEndClip={() => {
                          setDraggingSceneId(null);
                          setDragOverSceneId(null);
                        }}
                        onFileDragOverClip={(e) => handleSceneFileDragOver(s.id, e)}
                        onFileDragLeaveClip={() => handleSceneFileDragLeave(s.id)}
                        onFileDropClip={(e) => handleSceneFileDrop(s.id, e)}
                      >
                        <span className="truncate font-semibold">
                          Scene {s.order}
                          <span className="ml-1 text-[10px] font-normal opacity-70">
                            {s.effectiveDurationSec.toFixed(1)}s
                          </span>
                        </span>
                      </Clip>
                    ))}
                  </TimelineTrack>

                  {audioAssets.map((a, idx) => {
                    const meta = (a.metadataJson as Record<string, unknown> | null) ?? {};
                    const label =
                      typeof meta.label === "string"
                        ? (meta.label as string)
                        : idx === 0
                          ? "Narration"
                          : `Voice ${idx + 1}`;
                    // Narration is delayed by the cover intro. Secondary
                    // voices honour any explicit offset in their metadata.
                    const metaOffset =
                      typeof meta.offsetSec === "number" ? (meta.offsetSec as number) : 0;
                    const offset = idx === 0 ? coverPreviewDur : metaOffset;
                    const dur =
                      typeof meta.durationSec === "number"
                        ? (meta.durationSec as number)
                        : Math.max(1, totalDuration - offset);
                    return (
                      <TimelineTrack
                        key={a.id}
                        label={`A${idx + 1} · ${label}`}
                        color="emerald"
                      >
                        <Clip
                          start={offset}
                          duration={dur}
                          pxPerSec={pxPerSec}
                          active={false}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected({ type: "narration" });
                          }}
                          color="emerald"
                        >
                          <Mic2 className="mr-1 inline h-3 w-3" />
                          <span className="truncate">{label}</span>
                        </Clip>
                      </TimelineTrack>
                    );
                  })}

                  {musicAssets.map((m, idx) => {
                    const meta = trackMeta(m);
                    const draft = musicDraft[m.id];
                    const offset = draft?.offsetSec ?? meta.offsetSec;
                    const effectiveDuration =
                      draft?.durationSec ??
                      meta.durationSec ??
                      Math.max(1, totalDuration - offset);
                    return (
                      <TimelineTrack key={m.id} label={`A${idx + 2} · ${meta.label}`} color="violet">
                        <Clip
                          start={offset}
                          duration={effectiveDuration}
                          pxPerSec={pxPerSec}
                          active={selected?.type === "music" && selected.id === m.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected({ type: "music", id: m.id });
                          }}
                          color="violet"
                          resizable
                          onTrimStart={(e) => startMusicEdit(m.id, "trimEnd", e)}
                          onTrimStartLeft={(e) => startMusicEdit(m.id, "trimStart", e)}
                          onMoveBody={(e) => startMusicEdit(m.id, "move", e)}
                          onDelete={(e) => {
                            e.stopPropagation();
                            void deleteMusicTrack(m.id);
                          }}
                        >
                          <Music2 className="mr-1 inline h-3 w-3" />
                          <span className="truncate">{meta.label}</span>
                          <span className="ml-1 text-[10px] opacity-70">
                            {effectiveDuration.toFixed(1)}s
                          </span>
                        </Clip>
                      </TimelineTrack>
                    );
                  })}
                </div>

                {/* Playhead */}
                <div
                  className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-red-500"
                  style={{ left: currentTime * pxPerSec }}
                >
                  <div className="absolute -top-0.5 -left-[5px] h-2.5 w-2.5 rounded-full bg-red-500" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ----- RIGHT: Properties panel ----- */}
        <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-slate-900/50">
          <div className="border-b border-white/10 px-3 py-2 text-[11px] uppercase tracking-widest text-muted-foreground">
            Properties
          </div>
          <div className="flex-1 overflow-y-auto p-3 text-sm">
            {selected?.type === "scene" && selectedScene ? (
              <ScenePanel
                scene={selectedScene}
                sceneCount={project.scenes.length}
                saving={savingSceneId === selectedScene.id}
                onPatch={(patch) => patchScene(selectedScene.id, patch)}
                onDelete={() => deleteScene(selectedScene.id)}
                onSplit={() => splitSceneAtPlayhead(selectedScene.id)}
                onMove={(delta) => moveSceneOrder(selectedScene.id, delta)}
                onUploadImage={(file) => uploadSceneImage(selectedScene.id, file)}
                onDurationDraft={(v) =>
                  setDraftDurations((d) => ({ ...d, [selectedScene.id]: v }))
                }
                draftDuration={draftDurations[selectedScene.id] ?? selectedScene.durationSec}
              />
            ) : selected?.type === "hook" ? (
              <div className="space-y-3">
                <p className="font-semibold">Title hook</p>
                <textarea
                  className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm"
                  rows={3}
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  placeholder="e.g. THIS CHANGED EVERYTHING"
                />
                <Button size="sm" className="w-full" disabled={savingHook} onClick={saveHook}>
                  {savingHook ? "Saving…" : "Save hook"}
                </Button>
                <p className="text-[11px] text-muted-foreground">
                  Burned onto the opening 3 seconds during export.
                </p>
              </div>
            ) : selected?.type === "narration" && audioAsset ? (
              <div className="space-y-3">
                <p className="font-semibold">Narration</p>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Preview volume: {narrationVolume}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={narrationVolume}
                    onChange={(e) => setNarrationVolume(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <Button asChild size="sm" variant="outline" className="w-full">
                  <a href={`/api/assets/${audioAsset.id}?download=1`}>
                    <Download className="mr-2 h-3 w-3" /> Download
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  disabled={generatingSrt}
                  onClick={handleGenerateSrt}
                >
                  {generatingSrt ? "Generating SRT…" : "Generate SRT subtitles"}
                </Button>
                {subtitleAsset ? (
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <a href={`/api/assets/${subtitleAsset.id}?download=1`}>
                      <Download className="mr-2 h-3 w-3" /> Download SRT
                    </a>
                  </Button>
                ) : null}
              </div>
            ) : selected?.type === "cover" ? (
              <div className="space-y-3">
                <p className="font-semibold">Cover / thumbnail</p>
                {coverAsset ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/assets/${coverAsset.id}`}
                    alt="Cover"
                    className="aspect-video w-full rounded-lg border border-white/10 object-cover"
                  />
                ) : (
                  <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 text-xs text-muted-foreground">
                    No cover yet
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    Optional prompt override
                  </label>
                  <textarea
                    className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-xs"
                    rows={3}
                    placeholder="Leave blank to auto-compose from title, hook, and scenes."
                    value={coverPromptOverride}
                    onChange={(e) => setCoverPromptOverride(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  className="w-full"
                  disabled={generatingCover}
                  onClick={handleGenerateCover}
                >
                  {generatingCover
                    ? "Generating…"
                    : coverAsset
                      ? "Regenerate cover (AI)"
                      : "Generate cover (AI)"}
                </Button>
                <label className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-2 text-xs text-muted-foreground hover:bg-white/[0.04]">
                  {uploadingCover ? "Uploading…" : "Upload cover from device"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingCover}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadCoverFile(f);
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
                {coverAsset ? (
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <a href={`/api/assets/${coverAsset.id}?download=1`}>
                      <Download className="mr-2 h-3 w-3" /> Download cover
                    </a>
                  </Button>
                ) : null}
                {coverAsset ? (
                  <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-2 text-[11px] text-cyan-200">
                    ✓ This cover will appear as the first {coverDurationSec}s of your
                    next render. Toggle under <em>Export settings</em> → &quot;Add cover
                    as intro&quot;.
                  </div>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Rendered with your Gemini image model. Composed from the
                  project title{hookText ? ", the hook," : ""} and the opening
                  scene descriptions — leaves space at the top for overlay text
                  you can add in Canva / Photoshop.
                </p>
              </div>
            ) : selected?.type === "music" ? (
              (() => {
                const m = musicAssets.find((a) => a.id === selected.id);
                if (!m) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      Track removed. Pick another from the timeline.
                    </p>
                  );
                }
                const meta = trackMeta(m);
                return (
                  <div className="space-y-3">
                    <p className="font-semibold">Audio track · {meta.label}</p>
                    <audio className="w-full" controls src={`/api/assets/${m.id}`} />

                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">
                        Volume: {Math.round(meta.volume * 100)}%
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={Math.round(meta.volume * 100)}
                        onChange={(e) =>
                          patchMusicTrack(m.id, { volume: Number(e.target.value) / 100 })
                        }
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Offset (s)</label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          defaultValue={meta.offsetSec}
                          onBlur={(e) =>
                            patchMusicTrack(m.id, { offsetSec: Number(e.target.value) })
                          }
                          className="w-full rounded-xl border border-border bg-black/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground">Duration (s)</label>
                        <input
                          type="number"
                          step={0.1}
                          min={0.5}
                          defaultValue={meta.durationSec ?? ""}
                          placeholder="full"
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v === "") return;
                            patchMusicTrack(m.id, { durationSec: Number(v) });
                          }}
                          className="w-full rounded-xl border border-border bg-black/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[11px] text-muted-foreground">
                          Trim start of source (s)
                        </label>
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          defaultValue={meta.trimStartSec}
                          onBlur={(e) =>
                            patchMusicTrack(m.id, { trimStartSec: Number(e.target.value) })
                          }
                          className="w-full rounded-xl border border-border bg-black/20 px-2 py-1 text-xs"
                        />
                      </div>
                      <div className="space-y-1 col-span-2">
                        <label className="text-[11px] text-muted-foreground">Track label</label>
                        <input
                          type="text"
                          defaultValue={meta.label}
                          onBlur={(e) => patchMusicTrack(m.id, { label: e.target.value })}
                          className="w-full rounded-xl border border-border bg-black/20 px-2 py-1 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void splitMusicTrackAtPlayhead(m.id)}
                      >
                        <Scissors className="mr-1 h-3 w-3" />
                        Split at playhead
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-300 hover:bg-red-500/10"
                        onClick={() => void deleteMusicTrack(m.id)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        Remove
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Drag edges to trim, drag middle to reposition, press{" "}
                      <kbd className="rounded bg-white/10 px-1">S</kbd> or click
                      <em> Split </em> to cut this track at the playhead into two
                      independently-movable pieces.
                    </p>
                  </div>
                );
              })()
            ) : (
              // Default panel = project-wide settings + export controls
              <div className="space-y-4">
                {/* Master image style prompt */}
                <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                  <p className="text-sm font-semibold">Master image style</p>
                  <textarea
                    className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-xs"
                    placeholder={`e.g.
"2D cel-shaded cartoon, Studio Ghibli palette"
"Photo-realistic 3D render, cinematic lighting"
"Vintage oil painting, moody brushstrokes"`}
                    rows={3}
                    value={stylePrompt}
                    onChange={(e) => setStylePrompt(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={savingStyle}
                    onClick={saveStylePrompt}
                  >
                    {savingStyle ? "Saving…" : "Save master style"}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">
                    Appended to every scene&apos;s image prompt, the cover
                    prompt, and Veo clip prompts. Regenerate any image after
                    changing this for it to take effect on that scene.
                  </p>
                </div>

                <p className="font-semibold">Export settings</p>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={includeSubtitles}
                    onChange={(e) => setIncludeSubtitles(e.target.checked)}
                  />
                  <span className="text-xs">Burn subtitles into MP4</span>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={generateSrt}
                    onChange={(e) => setGenerateSrt(e.target.checked)}
                  />
                  <span className="text-xs">Also produce a separate SRT file</span>
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={compressForUpload}
                    onChange={(e) => setCompressForUpload(e.target.checked)}
                  />
                  <span className="text-xs">Compress for social upload (smaller file)</span>
                </label>

                {/* Cover intro — prepends the generated cover as the first
                    seconds of the rendered video. Only meaningful if a cover
                    has been generated in the media panel. */}
                <div
                  className={`space-y-2 rounded-xl border px-3 py-2 ${
                    coverAsset
                      ? "border-white/10 bg-black/20"
                      : "border-white/5 bg-black/10 opacity-60"
                  }`}
                >
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={includeCover}
                      disabled={!coverAsset}
                      onChange={(e) => setIncludeCover(e.target.checked)}
                    />
                    <span className="text-xs">
                      Add cover as intro
                      {!coverAsset ? (
                        <span className="block text-[11px] text-muted-foreground">
                          Generate a cover in the left media panel first.
                        </span>
                      ) : null}
                    </span>
                  </label>
                  {coverAsset && includeCover ? (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-muted-foreground">
                        Intro duration
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={8}
                        step={0.5}
                        value={coverDurationSec}
                        onChange={(e) => setCoverDurationSec(Number(e.target.value))}
                        className="w-16 rounded-md border border-border bg-black/20 px-2 py-1 text-xs"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        sec (narration delayed by this amount)
                      </span>
                    </div>
                  ) : null}
                </div>
                {finalVideoAsset ? (
                  <>
                    <Button asChild size="sm" variant="outline" className="w-full">
                      <a href={`/api/assets/${finalVideoAsset.id}?download=1`}>
                        <Download className="mr-2 h-3 w-3" /> Download latest MP4
                      </a>
                    </Button>

                    <div className="space-y-2 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-3">
                      <p className="text-sm font-semibold">Generate Shorts ✂️</p>
                      <p className="text-[11px] text-muted-foreground">
                        Slice this long-form video into vertical 9:16 clips for
                        Shorts / Reels / TikTok. Windows snap to scene boundaries
                        (no mid-sentence cuts).
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">
                            Count
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={10}
                            value={shortsCount}
                            onChange={(e) => setShortsCount(Number(e.target.value))}
                            className="w-full rounded-md border border-border bg-black/20 px-2 py-1 text-xs"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">
                            Seconds each
                          </label>
                          <input
                            type="number"
                            min={15}
                            max={90}
                            value={shortsDuration}
                            onChange={(e) => setShortsDuration(Number(e.target.value))}
                            className="w-full rounded-md border border-border bg-black/20 px-2 py-1 text-xs"
                          />
                        </div>
                      </div>
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={generatingShorts}
                        onClick={handleGenerateShorts}
                      >
                        {generatingShorts ? "Cutting Shorts…" : "Generate Shorts"}
                      </Button>
                    </div>
                  </>
                ) : null}
                {message ? (
                  <p className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-cyan-200">
                    {message}
                  </p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Click any clip in the timeline to edit its properties. The{" "}
                  <strong>Export MP4</strong> button in the top bar renders everything together.
                </p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// =====================================================================
// Timeline sub-components
// =====================================================================

function TimelineTrack({
  label,
  color,
  children
}: {
  label: string;
  color: "cyan" | "emerald" | "violet" | "amber";
  children: React.ReactNode;
}) {
  const barColor = {
    cyan: "bg-cyan-400/10 border-cyan-400/20",
    emerald: "bg-emerald-400/10 border-emerald-400/20",
    violet: "bg-violet-400/10 border-violet-400/20",
    amber: "bg-amber-400/10 border-amber-400/20"
  }[color];
  return (
    <div className="relative flex h-12 items-center">
      <div className="sticky left-0 z-[5] mr-1 flex h-full w-24 shrink-0 items-center rounded-l-lg border border-white/5 bg-slate-900 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={`relative h-full flex-1 rounded-r-lg border ${barColor}`}>
        {children}
      </div>
    </div>
  );
}

function Clip({
  start,
  duration,
  pxPerSec,
  active,
  onClick,
  color,
  children,
  image,
  resizable,
  onTrimStart,
  onTrimStartLeft,
  onMoveBody,
  onDelete,
  draggable,
  dragging,
  dragOver,
  onDragStartClip,
  onDragOverClip,
  onDragLeaveClip,
  onDropClip,
  onDragEndClip,
  onFileDragOverClip,
  onFileDragLeaveClip,
  onFileDropClip
}: {
  start: number;
  duration: number;
  pxPerSec: number;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  color: "cyan" | "emerald" | "violet" | "amber";
  children: React.ReactNode;
  image?: string;
  resizable?: boolean;
  /** Drag on right edge = resize end (duration). */
  onTrimStart?: (e: React.MouseEvent) => void;
  /** Drag on left edge = trim start / shift source offset. */
  onTrimStartLeft?: (e: React.MouseEvent) => void;
  /** Drag on the body interior = move the whole clip on the timeline. */
  onMoveBody?: (e: React.MouseEvent) => void;
  onDelete?: (e: React.MouseEvent) => void;
  /** HTML5 drag-drop reorder (scene track only). */
  draggable?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onDragStartClip?: () => void;
  onDragOverClip?: () => void;
  onDragLeaveClip?: () => void;
  onDropClip?: () => void;
  onDragEndClip?: () => void;
  /** Dropping OS files on this clip (images) */
  onFileDragOverClip?: (e: React.DragEvent) => void;
  onFileDragLeaveClip?: () => void;
  onFileDropClip?: (e: React.DragEvent) => void;
}) {
  const palette = {
    cyan: {
      bg: "bg-gradient-to-br from-cyan-500/60 to-blue-500/60",
      ring: "ring-cyan-300"
    },
    emerald: {
      bg: "bg-gradient-to-br from-emerald-500/60 to-teal-500/60",
      ring: "ring-emerald-300"
    },
    violet: {
      bg: "bg-gradient-to-br from-violet-500/60 to-purple-500/60",
      ring: "ring-violet-300"
    },
    amber: {
      bg: "bg-gradient-to-br from-amber-500/70 to-orange-500/70",
      ring: "ring-amber-300"
    }
  }[color];
  return (
    <div
      onClick={onClick}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        // Firefox needs something in dataTransfer to start a drag.
        try {
          e.dataTransfer.setData("text/plain", "clip");
        } catch {
          /* noop */
        }
        onDragStartClip?.();
      }}
      onDragOver={(e) => {
        // Files → image replace path
        if (e.dataTransfer.types.includes("Files") && onFileDragOverClip) {
          onFileDragOverClip(e);
          return;
        }
        if (!draggable) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOverClip?.();
      }}
      onDragLeave={() => {
        onFileDragLeaveClip?.();
        onDragLeaveClip?.();
      }}
      onDrop={(e) => {
        // Files → replace this scene's image
        if (e.dataTransfer.types.includes("Files") && onFileDropClip) {
          onFileDropClip(e);
          return;
        }
        if (!draggable) return;
        e.preventDefault();
        onDropClip?.();
      }}
      onDragEnd={() => onDragEndClip?.()}
      onMouseDown={(e) => {
        // Only start a body-drag (move) if no edge was clicked.
        if (!onMoveBody) return;
        const el = e.currentTarget as HTMLElement;
        const rect = el.getBoundingClientRect();
        const localX = e.clientX - rect.left;
        const EDGE = 8;
        if (localX <= EDGE || localX >= rect.width - EDGE) return;
        onMoveBody(e);
      }}
      className={`group absolute top-1 bottom-1 overflow-hidden rounded-md border border-white/10 text-left text-[11px] text-white shadow-sm ${palette.bg} ${
        active ? `ring-2 ${palette.ring}` : ""
      } ${dragging ? "opacity-40" : ""} ${dragOver ? "ring-2 ring-white" : ""} ${
        onMoveBody ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
      style={{
        left: start * pxPerSec,
        width: Math.max(8, duration * pxPerSec - 2)
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-40"
        />
      ) : null}
      <span className="relative flex h-full items-center gap-1 px-2">{children}</span>

      {/* Delete X */}
      {onDelete ? (
        <button
          onClick={onDelete}
          title="Delete"
          className="absolute right-1 top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-black/60 text-[10px] text-red-300 hover:bg-red-500 hover:text-white group-hover:flex"
        >
          ×
        </button>
      ) : null}

      {/* Left trim handle */}
      {resizable && onTrimStartLeft ? (
        <div
          onMouseDown={onTrimStartLeft}
          title="Drag to trim start"
          className="absolute left-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/70"
        />
      ) : null}

      {/* Right trim handle */}
      {resizable && onTrimStart ? (
        <div
          onMouseDown={onTrimStart}
          title="Drag to resize"
          className="absolute right-0 top-0 bottom-0 z-10 w-1.5 cursor-ew-resize bg-white/0 hover:bg-white/70"
        />
      ) : null}
    </div>
  );
}

// =====================================================================
// Scene properties panel
// =====================================================================

const CAMERA_OPTIONS = [
  { value: "zoomIn", label: "Zoom in" },
  { value: "zoomOut", label: "Zoom out" },
  { value: "panLeft", label: "Pan left" },
  { value: "panRight", label: "Pan right" },
  { value: "panUp", label: "Pan up" },
  { value: "panDown", label: "Pan down" },
  { value: "none", label: "No motion" }
];
const TRANSITION_OPTIONS = [
  { value: "fade", label: "Fade" },
  { value: "dissolve", label: "Dissolve" },
  { value: "cut", label: "Cut" }
];

function ScenePanel({
  scene,
  sceneCount,
  saving,
  draftDuration,
  onPatch,
  onDurationDraft,
  onDelete,
  onSplit,
  onMove,
  onUploadImage
}: {
  scene: SceneData & { startSec: number; endSec: number; effectiveDurationSec: number };
  sceneCount: number;
  saving: boolean;
  draftDuration: number;
  onPatch: (patch: Record<string, unknown>) => void;
  onDurationDraft: (v: number) => void;
  onDelete: () => void;
  onSplit: () => void;
  onMove: (delta: -1 | 1) => void;
  onUploadImage: (file: File) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Scene {scene.order}</p>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
          {formatDuration(scene.startSec)} – {formatDuration(scene.endSec)}
        </span>
      </div>

      {/* Quick action bar */}
      <div className="grid grid-cols-4 gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
        <button
          onClick={() => onMove(-1)}
          disabled={scene.order === 1 || saving}
          title="Move up ( [ )"
          className="flex items-center justify-center rounded-lg py-1.5 text-xs hover:bg-white/10 disabled:opacity-30"
        >
          <ArrowUp className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={scene.order === sceneCount || saving}
          title="Move down ( ] )"
          className="flex items-center justify-center rounded-lg py-1.5 text-xs hover:bg-white/10 disabled:opacity-30"
        >
          <ArrowDown className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onSplit}
          disabled={saving}
          title="Split at playhead ( S )"
          className="flex items-center justify-center rounded-lg py-1.5 text-xs hover:bg-white/10 disabled:opacity-30"
        >
          <Scissors className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          disabled={saving}
          title="Delete scene ( Del )"
          className="flex items-center justify-center rounded-lg py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-30"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {scene.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={scene.imageUrl}
          alt=""
          className="aspect-video w-full rounded-lg border border-white/10 object-cover"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-white/15 bg-black/20 text-xs text-muted-foreground">
          No image yet
        </div>
      )}
      <label className="flex w-full cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 px-3 py-2 text-xs text-muted-foreground hover:bg-white/[0.04]">
        {saving ? "Uploading…" : scene.imageUrl ? "Replace image (upload)" : "Upload image"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={saving}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUploadImage(f);
            e.currentTarget.value = "";
          }}
        />
      </label>
      <div className="space-y-1">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Narration
        </label>
        <p className="rounded-xl bg-black/20 p-2 text-xs text-slate-200">{scene.narrationText}</p>
      </div>
      <div className="space-y-1">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Subtitle
        </label>
        <p className="rounded-xl bg-black/20 p-2 text-xs">{scene.subtitleText}</p>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Duration (seconds)</label>
        <div className="flex gap-2">
          <input
            type="number"
            min={0.5}
            step={0.25}
            value={draftDuration}
            onChange={(e) => onDurationDraft(Number(e.target.value))}
            className="flex-1 rounded-xl border border-border bg-black/20 px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={saving || draftDuration === scene.effectiveDurationSec}
            onClick={() => onPatch({ durationSec: draftDuration })}
          >
            {saving ? "Saving" : "Apply"}
          </Button>
        </div>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Camera motion</label>
        <select
          className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm"
          value={scene.cameraMotion ?? "zoomIn"}
          disabled={saving}
          onChange={(e) => onPatch({ cameraMotion: e.target.value })}
        >
          {CAMERA_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Transition out</label>
        <select
          className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm"
          value={scene.transition ?? "fade"}
          disabled={saving}
          onChange={(e) => onPatch({ transition: e.target.value })}
        >
          {TRANSITION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
