"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type CameraMotion =
  | "none"
  | "zoomIn"
  | "zoomOut"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown";
type Transition = "cut" | "fade" | "dissolve";

interface Scene {
  id: string;
  order: number;
  narrationText: string;
  subtitleText: string;
  visualDescription: string;
  imagePrompt: string;
  durationSec: number;
  cameraMotion?: string;
  transition?: string;
}

interface SceneCardsProps {
  project: {
    id: string;
    script: string;
    scenes: Scene[];
    assets?: Array<{
      id: string;
      type: string;
      sceneId: string | null;
      metadataJson?: unknown;
    }>;
  } | null;
}

const CAMERA_OPTIONS: { value: CameraMotion; label: string }[] = [
  { value: "zoomIn", label: "Zoom in" },
  { value: "zoomOut", label: "Zoom out" },
  { value: "panLeft", label: "Pan left" },
  { value: "panRight", label: "Pan right" },
  { value: "panUp", label: "Pan up" },
  { value: "panDown", label: "Pan down" },
  { value: "none", label: "No motion" }
];
const TRANSITION_OPTIONS: { value: Transition; label: string }[] = [
  { value: "fade", label: "Fade" },
  { value: "dissolve", label: "Dissolve" },
  { value: "cut", label: "Cut (no transition)" }
];

export function SceneCards({ project }: SceneCardsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [savingSceneId, setSavingSceneId] = useState<string | null>(null);
  const [aiVideoSceneId, setAiVideoSceneId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function handleGenerateScenes() {
    if (!project) return setMessage("Create or open a project first.");
    if (!project.script.trim()) {
      return setMessage("Generate or write a script before creating scenes.");
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/generate`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Scene generation failed");
      setMessage(`Generated ${payload.scenes.length} scenes. Redirecting…`);
      router.push(`/scene-studio?projectId=${project.id}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scene generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function updateSceneMotion(sceneId: string, field: "cameraMotion" | "transition", value: string) {
    if (!project) return;
    setSavingSceneId(sceneId);
    try {
      const res = await fetch(`/api/projects/${project.id}/scenes/${sceneId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Update failed");
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingSceneId(null);
    }
  }

  async function generateAiVideoForScene(sceneId: string) {
    if (!project) return;
    setAiVideoSceneId(sceneId);
    setMessage("Generating AI video clip (this can take 30–60s)…");
    try {
      const res = await fetch(
        `/api/projects/${project.id}/scenes/${sceneId}/ai-video`,
        { method: "POST" }
      );
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "AI video failed");
      setMessage("AI video clip ready. Render will use it in place of the still.");
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "AI video failed");
    } finally {
      setAiVideoSceneId(null);
    }
  }

  function aiClipForScene(sceneId: string) {
    return project?.assets?.find(
      (a) =>
        a.type === "video" &&
        a.sceneId === sceneId &&
        (a.metadataJson as { kind?: string } | null)?.kind === "scene-clip"
    );
  }

  function sceneHasImage(sceneId: string) {
    return Boolean(project?.assets?.some((a) => a.type === "image" && a.sceneId === sceneId));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {project?.scenes.length
            ? `${project.scenes.length} scene beats ready.`
            : "No scenes yet for this project."}
        </p>
        <Button onClick={handleGenerateScenes} disabled={loading}>
          {loading ? "Generating scenes…" : "Generate scenes"}
        </Button>
      </div>
      {message ? <p className="text-sm text-cyan-200">{message}</p> : null}

      {project?.scenes.map((scene) => {
        const aiClip = aiClipForScene(scene.id);
        const cameraMotion = (scene.cameraMotion ?? "zoomIn") as CameraMotion;
        const transition = (scene.transition ?? "fade") as Transition;
        return (
          <Card key={scene.id}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>Scene {scene.order}</CardTitle>
                <CardDescription>{scene.durationSec} seconds</CardDescription>
              </div>
              {aiClip ? (
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                  AI video ready
                </span>
              ) : null}
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Narration</p>
                <p className="text-sm text-slate-200">{scene.narrationText}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Subtitle</p>
                <p className="subtitle-pill">{scene.subtitleText}</p>
              </div>
              <div className="space-y-2">
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Visual description</p>
                <p className="text-sm text-slate-200">{scene.visualDescription}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Image prompt</p>
                <p className="text-sm text-slate-400">{scene.imagePrompt}</p>
              </div>

              <div className="lg:col-span-2 grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Camera motion</label>
                  <select
                    className="w-full rounded-xl border border-border bg-black/20 px-3 py-2 text-sm"
                    value={cameraMotion}
                    disabled={savingSceneId === scene.id}
                    onChange={(e) => updateSceneMotion(scene.id, "cameraMotion", e.target.value)}
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
                    value={transition}
                    disabled={savingSceneId === scene.id}
                    onChange={(e) => updateSceneMotion(scene.id, "transition", e.target.value)}
                  >
                    {TRANSITION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">AI video clip (Veo)</label>
                  <Button
                    size="sm"
                    variant={aiClip ? "outline" : "default"}
                    className="w-full"
                    disabled={aiVideoSceneId === scene.id || !sceneHasImage(scene.id)}
                    onClick={() => generateAiVideoForScene(scene.id)}
                    title={
                      sceneHasImage(scene.id)
                        ? undefined
                        : "Generate the scene image first"
                    }
                  >
                    {aiVideoSceneId === scene.id
                      ? "Generating…"
                      : !sceneHasImage(scene.id)
                        ? "Needs image first"
                        : aiClip
                          ? "Regenerate"
                          : "Generate"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}

      {project && project.scenes.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Generate scenes to break the project script into narration beats, subtitles,
            visual descriptions, and image prompts.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
