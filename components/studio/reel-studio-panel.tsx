"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDuration } from "@/lib/utils";

interface ReelStudioPanelProps {
  project: {
    id: string;
    assets?: Array<{
      id: string;
      type: string;
      metadataJson?: { kind?: string } | null;
    }>;
    scenes: Array<{
      id: string;
      order: number;
      subtitleText: string;
      durationSec: number;
      imageUrl: string | null;
    }>;
  } | null;
}

const REEL_DURATION_SEC = 30;

export function ReelStudioPanel({ project }: ReelStudioPanelProps) {
  const router = useRouter();
  const [startSec, setStartSec] = useState(0);
  const [includeSubtitles, setIncludeSubtitles] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const timeline = useMemo(() => {
    let cursor = 0;
    return (project?.scenes ?? []).map((scene) => {
      const start = cursor;
      const end = cursor + scene.durationSec;
      cursor = end;
      return {
        ...scene,
        startSec: start,
        endSec: end
      };
    });
  }, [project]);

  const reelScenes = useMemo(() => {
    const clipEnd = startSec + REEL_DURATION_SEC;
    return timeline.filter((scene) => scene.endSec > startSec && scene.startSec < clipEnd);
  }, [startSec, timeline]);

  const latestReelAsset = useMemo(
    () =>
      project?.assets?.find(
        (asset) => asset.type === "video" && (asset.metadataJson as { kind?: string } | null)?.kind === "reel"
      ) ?? null,
    [project]
  );

  async function handleGenerateReel() {
    if (!project) {
      setMessage("Create or open a project first.");
      return;
    }

    setRendering(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/reel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          startSec,
          includeSubtitles
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Reel generation failed");
      }
      setMessage("30-second reel generated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Reel generation failed");
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
      <Card>
        <CardHeader>
          <CardTitle>Reel Settings</CardTitle>
          <CardDescription>Choose where the 30-second vertical reel starts inside the current project timeline.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm text-muted-foreground">Reel start time</label>
            <input
              className="w-full rounded-xl border border-border bg-black/20 px-4 py-3 text-sm"
              min={0}
              step={1}
              type="number"
              value={startSec}
              onChange={(event) => setStartSec(Number(event.target.value))}
            />
            <p className="text-xs text-muted-foreground">This creates a fixed {REEL_DURATION_SEC}-second reel.</p>
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <input
              checked={includeSubtitles}
              className="h-4 w-4"
              type="checkbox"
              onChange={(event) => setIncludeSubtitles(event.target.checked)}
            />
            <span className="text-sm">Include subtitles in reel</span>
          </label>
          {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
          {latestReelAsset ? (
            <a
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-transparent text-sm font-semibold hover:bg-white/5"
              href={`/api/assets/${latestReelAsset.id}?download=1`}
            >
              Download latest reel
            </a>
          ) : null}
          <Button className="w-full" disabled={!reelScenes.length || rendering} onClick={handleGenerateReel}>
            {rendering ? "Generating reel..." : "Generate 30s Reel"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reel Window</CardTitle>
          <CardDescription>
            Scenes included from {formatDuration(startSec)} to {formatDuration(startSec + REEL_DURATION_SEC)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {reelScenes.length ? (
            reelScenes.map((scene) => (
              <div key={scene.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
                <p className="font-semibold">Scene {scene.order}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatDuration(scene.startSec)} - {formatDuration(scene.endSec)}
                </p>
                <p className="mt-2 text-sm text-slate-300">{scene.subtitleText}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No scenes fall inside the selected 30-second window yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
