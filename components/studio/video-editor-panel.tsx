"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEditorStore } from "@/lib/store/editor-store";
import { formatDuration } from "@/lib/utils";

interface VideoEditorPanelProps {
  project: {
    assets?: Array<{
      id: string;
      type: string;
      createdAt: string | Date;
    }>;
    id: string;
    title: string;
    scenes: Array<{
      id: string;
      order: number;
      narrationText?: string;
      subtitleText: string;
      durationSec: number;
      imageUrl: string | null;
    }>;
  } | null;
}

export function VideoEditorPanel({ project }: VideoEditorPanelProps) {
  const router = useRouter();
  const {
    aspectRatio,
    activeTransition,
    narrationVolume,
    musicVolume,
    setAspectRatio,
    setActiveTransition,
    setNarrationVolume,
    setMusicVolume
  } = useEditorStore();
  const [draftDurations, setDraftDurations] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [savingSceneId, setSavingSceneId] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [generatingSrt, setGeneratingSrt] = useState(false);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [generateSrt, setGenerateSrt] = useState(true);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(project?.scenes[0]?.id ?? null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioAsset = useMemo(
    () => project?.assets?.find((asset) => asset.type === "audio"),
    [project]
  );
  const videoAsset = useMemo(
    () => project?.assets?.find((asset) => asset.type === "video"),
    [project]
  );
  const subtitleAsset = useMemo(
    () => project?.assets?.find((asset) => asset.type === "subtitle"),
    [project]
  );
  const sceneTimeline = useMemo(() => {
    let cursor = 0;
    return (project?.scenes ?? []).map((scene) => {
      const duration = draftDurations[scene.id] ?? scene.durationSec;
      const startSec = cursor;
      const endSec = cursor + duration;
      cursor = endSec;
      return {
        ...scene,
        startSec,
        endSec,
        effectiveDurationSec: duration
      };
    });
  }, [draftDurations, project]);
  const totalSceneDuration = useMemo(
    () => sceneTimeline.reduce((sum, scene) => sum + scene.effectiveDurationSec, 0),
    [sceneTimeline]
  );
  const selectedScene =
    sceneTimeline.find((scene) => scene.id === selectedSceneId) ??
    sceneTimeline[0] ??
    null;

  useEffect(() => {
    setDraftDurations(
      Object.fromEntries((project?.scenes ?? []).map((scene) => [scene.id, scene.durationSec]))
    );
    setSelectedSceneId(project?.scenes[0]?.id ?? null);
  }, [project]);

  function handleAudioTimeUpdate() {
    if (!audioRef.current) {
      return;
    }

    const currentTime = audioRef.current.currentTime;
    setAudioCurrentTime(currentTime);

    const activeScene = sceneTimeline.find(
      (scene) => currentTime >= scene.startSec && currentTime < scene.endSec
    );

    if (activeScene && activeScene.id !== selectedSceneId) {
      setSelectedSceneId(activeScene.id);
    }
  }

  function handleLoadedMetadata() {
    if (!audioRef.current) {
      return;
    }

    setAudioDuration(audioRef.current.duration || 0);
  }

  function selectScene(sceneId: string) {
    setSelectedSceneId(sceneId);
  }

  async function saveSceneDuration(sceneId: string) {
    if (!project) {
      return;
    }

    setSavingSceneId(sceneId);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          durationSec: Number(draftDurations[sceneId])
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to update scene duration");
      }
      setMessage(`Updated Scene ${payload.scene.order} duration.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update scene duration");
    } finally {
      setSavingSceneId(null);
    }
  }

  async function handleRender() {
    if (!project) {
      return;
    }

    setRendering(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          aspectRatio,
          includeSubtitles,
          generateSrt
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Render failed");
      }
      setMessage(
        generateSrt ? "MP4 render completed and SRT file generated." : "MP4 render completed."
      );
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  async function handleGenerateSrt() {
    if (!project) {
      return;
    }

    setGeneratingSrt(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/subtitles`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "SRT generation failed");
      }
      setMessage("SRT file generated from the current narration audio.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "SRT generation failed");
    } finally {
      setGeneratingSrt(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
      <Card>
        <CardHeader>
          <CardTitle>Video Preview</CardTitle>
          <CardDescription>Use the narration timeline and selected scene preview together to tune image timing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative aspect-video overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-800 to-slate-950">
            {selectedScene?.imageUrl ? (
              <img
                alt={`${project?.title ?? "Project"} scene preview`}
                className="h-full w-full object-cover"
                src={selectedScene.imageUrl}
              />
            ) : null}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
              <span className="subtitle-pill">
                {selectedScene?.subtitleText ?? "Generate or upload scene images to preview your video here."}
              </span>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {selectedScene ? `Selected scene ${selectedScene.order}` : "No scene selected"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedScene?.narrationText ?? "Select a scene card to inspect its image, subtitle, and timing."}
                </p>
                {selectedScene ? (
                  <p className="mt-2 text-xs text-cyan-200">
                    Timeline: {formatDuration(selectedScene.startSec)} to {formatDuration(selectedScene.endSec)}
                  </p>
                ) : null}
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-right text-sm">
                <p className="text-muted-foreground">Selected image duration</p>
                <p className="font-semibold">
                  {selectedScene ? `${draftDurations[selectedScene.id] ?? selectedScene.durationSec}s` : "--"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Total cut: {formatDuration(totalSceneDuration)}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold">Narration audio</p>
              <p className="text-xs text-muted-foreground">
                {formatDuration(audioCurrentTime)} / {formatDuration(audioDuration || totalSceneDuration)}
              </p>
            </div>
            {audioAsset ? (
              <div className="space-y-3">
                <audio
                  ref={audioRef}
                  className="w-full"
                  controls
                  src={`/api/assets/${audioAsset.id}`}
                  onLoadedMetadata={handleLoadedMetadata}
                  onTimeUpdate={handleAudioTimeUpdate}
                >
                  Your browser does not support audio playback.
                </audio>
                <div className="space-y-2">
                  <div className="relative flex h-4 overflow-hidden rounded-full border border-white/10 bg-black/30">
                    {sceneTimeline.map((scene) => {
                      const widthPercent = totalSceneDuration ? (scene.effectiveDurationSec / totalSceneDuration) * 100 : 0;
                      const isSelected = selectedScene?.id === scene.id;
                      return (
                        <button
                          key={scene.id}
                          type="button"
                          className={`h-full border-r border-black/20 transition ${
                            isSelected ? "bg-amber-400/80" : "bg-cyan-400/40 hover:bg-cyan-300/60"
                          }`}
                          style={{ width: `${widthPercent}%` }}
                          title={`Scene ${scene.order}: ${formatDuration(scene.startSec)} - ${formatDuration(scene.endSec)}`}
                          onClick={() => selectScene(scene.id)}
                        />
                      );
                    })}
                    <div
                      className="pointer-events-none absolute top-0 h-full w-0.5 bg-white"
                      style={{
                        left: `${audioDuration ? Math.min((audioCurrentTime / audioDuration) * 100, 100) : 0}%`
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    White marker = current audio time. Click a colored segment to inspect that scene image while listening.
                  </p>
                </div>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold hover:bg-white/5"
                  href={`/api/assets/${audioAsset.id}?download=1`}
                >
                  Download narration
                </a>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No narration audio yet. Generate or upload audio in Voice Studio.</p>
            )}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {sceneTimeline.map((scene) => (
              <div
                key={scene.id}
                onClick={() => selectScene(scene.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectScene(scene.id);
                  }
                }}
                role="button"
                tabIndex={0}
                className={`rounded-2xl border p-3 text-left text-sm transition ${
                  selectedScene?.id === scene.id
                    ? "border-amber-300/50 bg-amber-400/10"
                    : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"
                }`}
              >
                <p className="font-semibold">Scene {scene.order}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDuration(scene.startSec)} - {formatDuration(scene.endSec)} • {scene.imageUrl ? "image ready" : "image missing"}
                </p>
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-muted-foreground">Display duration (sec)</label>
                  <input
                    className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm"
                    min={1}
                    step={0.5}
                    type="number"
                    value={draftDurations[scene.id] ?? scene.effectiveDurationSec}
                    onChange={(event) =>
                      setDraftDurations((current) => ({
                        ...current,
                        [scene.id]: Number(event.target.value)
                      }))
                    }
                    onClick={(event) => event.stopPropagation()}
                  />
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() => saveSceneDuration(scene.id)}
                    disabled={savingSceneId === scene.id}
                  >
                    {savingSceneId === scene.id ? "Saving..." : "Save timing"}
                  </Button>
                </div>
              </div>
            )) ?? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-sm text-muted-foreground">
                No scenes yet. Generate scenes first, then create or upload images.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Render Controls</CardTitle>
          <CardDescription>Basic MVP editor controls with room for richer timeline tooling later.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="text-muted-foreground">Aspect ratio</p>
            <div className="flex gap-2">
              {["16:9", "9:16"].map((ratio) => (
                <Button
                  key={ratio}
                  size="sm"
                  variant={aspectRatio === ratio ? "default" : "outline"}
                  onClick={() => setAspectRatio(ratio as "16:9" | "9:16")}
                >
                  {ratio}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-muted-foreground">Transition</p>
            <div className="flex gap-2">
              {["fade", "crosszoom", "slide"].map((type) => (
                <Button
                  key={type}
                  size="sm"
                  variant={activeTransition === type ? "default" : "outline"}
                  onClick={() => setActiveTransition(type as "fade" | "crosszoom" | "slide")}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label>Narration volume: {narrationVolume}%</label>
            <input
              className="w-full"
              type="range"
              min={0}
              max={100}
              value={narrationVolume}
              onChange={(event) => setNarrationVolume(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2">
            <label>Music volume: {musicVolume}%</label>
            <input
              className="w-full"
              type="range"
              min={0}
              max={100}
              value={musicVolume}
              onChange={(event) => setMusicVolume(Number(event.target.value))}
            />
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-muted-foreground">
            {project?.scenes.some((scene) => scene.imageUrl)
              ? "Uploaded or generated scene images will be used by the video editor preview and render pipeline."
              : "Add scene images in Image Studio to make this project render-ready."}
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <input
              checked={includeSubtitles}
              className="h-4 w-4"
              type="checkbox"
              onChange={(event) => setIncludeSubtitles(event.target.checked)}
            />
            <span className="text-sm">
              Include subtitles in final MP4
            </span>
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <input
              checked={generateSrt}
              className="h-4 w-4"
              type="checkbox"
              onChange={(event) => setGenerateSrt(event.target.checked)}
            />
            <span className="text-sm">
              Generate SRT subtitle file
            </span>
          </label>
          {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
          {videoAsset ? (
            <a
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-transparent text-sm font-semibold hover:bg-white/5"
              href={`/api/assets/${videoAsset.id}?download=1`}
            >
              Download latest MP4
            </a>
          ) : null}
          {subtitleAsset ? (
            <a
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-transparent text-sm font-semibold hover:bg-white/5"
              href={`/api/assets/${subtitleAsset.id}?download=1`}
            >
              Download latest SRT
            </a>
          ) : null}
          <Button
            className="w-full"
            variant="outline"
            disabled={!audioAsset || generatingSrt}
            onClick={handleGenerateSrt}
          >
            {generatingSrt ? "Generating SRT..." : "Generate SRT Now"}
          </Button>
          <Button
            className="w-full"
            disabled={!project?.scenes.every((scene) => scene.imageUrl) || !audioAsset || rendering}
            onClick={handleRender}
          >
            {rendering ? "Rendering MP4..." : "Render MP4"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
