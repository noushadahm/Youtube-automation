"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SceneCardsProps {
  project: {
    id: string;
    script: string;
    scenes: Array<{
      id: string;
      order: number;
      narrationText: string;
      subtitleText: string;
      visualDescription: string;
      imagePrompt: string;
      durationSec: number;
    }>;
  } | null;
}

export function SceneCards({ project }: SceneCardsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleGenerateScenes() {
    if (!project) {
      setMessage("Create or open a project first.");
      return;
    }

    if (!project.script.trim()) {
      setMessage("Generate or write a script before creating scenes.");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/scenes/generate`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Scene generation failed");
      }
      setMessage(`Generated ${payload.scenes.length} scenes.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Scene generation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {project?.scenes.length ? `${project.scenes.length} scene beats ready.` : "No scenes yet for this project."}
        </p>
        <Button onClick={handleGenerateScenes} disabled={loading}>
          {loading ? "Generating scenes..." : "Generate scenes"}
        </Button>
      </div>
      {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
      {project?.scenes.map((scene) => (
        <Card key={scene.id}>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Scene {scene.order}</CardTitle>
              <CardDescription>{scene.durationSec} seconds</CardDescription>
            </div>
            <Button size="sm" variant="outline" disabled>
              Regenerate scene
            </Button>
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
          </CardContent>
        </Card>
      )) ?? null}
      {project && project.scenes.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Generate scenes to break the project script into narration beats, subtitles, visual descriptions, and image prompts.
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
