"use client";

import { type ChangeEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ImageGridProps {
  project: {
    id: string;
    scenes: Array<{
      id: string;
      order: number;
      visualDescription: string;
      imageUrl: string | null;
    }>;
  } | null;
}

export function ImageGrid({ project }: ImageGridProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function generateImages(sceneId?: string) {
    if (!project) {
      setMessage("Create or open a project first.");
      return;
    }

    setLoading(sceneId ?? "all");
    setMessage(null);
    try {
      const response = await fetch(`/api/projects/${project.id}/images/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(sceneId ? { sceneId } : {})
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Image generation failed");
      }
      setMessage(`Generated ${payload.results.length} image${payload.results.length === 1 ? "" : "s"}.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image generation failed");
    } finally {
      setLoading(null);
    }
  }

  async function uploadImage(sceneId: string, file: File) {
    if (!project) {
      setMessage("Create or open a project first.");
      return;
    }

    setLoading(sceneId);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("sceneId", sceneId);
      formData.append("file", file);

      const response = await fetch(`/api/projects/${project.id}/images/upload`, {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Image upload failed");
      }

      setMessage("Custom scene image uploaded.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setLoading(null);
    }
  }

  async function handleFileUpload(sceneId: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await uploadImage(sceneId, file);
    event.target.value = "";
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scene Images</CardTitle>
        <CardDescription>Generate, replace, or upload a single frame while keeping visual consistency.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {project?.scenes.length ? `${project.scenes.length} scenes available for image generation.` : "Generate scenes first to create images."}
          </p>
          <Button onClick={() => generateImages()} disabled={!project?.scenes.length || !!loading}>
            {loading === "all" ? "Generating images..." : "Generate all images"}
          </Button>
        </div>
        {message ? <p className="mb-4 text-sm text-cyan-200">{message}</p> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {project?.scenes.map((scene) => (
          <div key={scene.id} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
            {scene.imageUrl ? (
              <img
                alt={`Scene ${scene.order}`}
                className="mb-3 aspect-[4/5] w-full rounded-2xl object-cover"
                src={scene.imageUrl}
              />
            ) : (
              <div className="mb-3 aspect-[4/5] rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950" />
            )}
            <p className="text-sm font-semibold">Scene {scene.order}</p>
            <p className="mt-1 text-xs text-muted-foreground">{scene.visualDescription}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={() => generateImages(scene.id)} disabled={!!loading}>
                {loading === scene.id ? "Generating..." : "Regenerate"}
              </Button>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border px-3 py-2 text-sm font-semibold hover:bg-white/5">
                <ImagePlus className="mr-2 h-4 w-4" />
                Upload image
                <input className="hidden" type="file" accept="image/*" onChange={(event) => handleFileUpload(scene.id, event)} />
              </label>
            </div>
          </div>
          )) ?? null}
        </div>
      </CardContent>
    </Card>
  );
}
