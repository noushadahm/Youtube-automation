"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { genreOptions } from "@/lib/constants";

const LONGFORM_DURATIONS = [
  { label: "1 min", value: 60 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 },
  { label: "15 min", value: 900 }
];
const SHORTS_DURATIONS = [
  { label: "10s", value: 10 },
  { label: "15s", value: 15 },
  { label: "20s", value: 20 },
  { label: "30s", value: 30 },
  { label: "45s", value: 45 },
  { label: "60s", value: 60 },
  { label: "90s", value: 90 }
];

export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<"longform" | "shorts">("longform");
  const [duration, setDuration] = useState<number>(300);

  function pickFormat(next: "longform" | "shorts") {
    setFormat(next);
    if (next === "shorts") {
      setDuration((d) => (d > 90 ? 30 : d));
    } else {
      setDuration((d) => (d < 60 ? 180 : d));
    }
  }

  async function onSubmit(formData: FormData) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.get("title"),
          storySourceType: formData.get("storySourceType"),
          targetDurationSec: duration,
          genre: formData.get("genre"),
          language: formData.get("language"),
          aspectRatio: format === "shorts" ? "9:16" : "16:9",
          hookText: formData.get("hookText")
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? `Failed to create project (${response.status})`);
      }

      router.push(`/script-studio?projectId=${payload.project.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  }

  const choices = format === "shorts" ? SHORTS_DURATIONS : LONGFORM_DURATIONS;

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Create a new video project</CardTitle>
        <CardDescription>
          Choose a format first — that sets the aspect ratio and the duration
          units. Paste a hook headline to burn onto the first 3 seconds for retention.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="grid gap-5 md:grid-cols-2">
          {/* Format picker */}
          <div className="space-y-2 md:col-span-2">
            <Label>Format</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => pickFormat("longform")}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  format === "longform"
                    ? "border-cyan-400 bg-cyan-400/10"
                    : "border-white/10 bg-black/20 hover:border-white/30"
                }`}
              >
                <p className="text-sm font-semibold">📺 Video (long-form)</p>
                <p className="text-[11px] text-muted-foreground">
                  16:9 · YouTube · duration in minutes
                </p>
              </button>
              <button
                type="button"
                onClick={() => pickFormat("shorts")}
                className={`rounded-xl border px-3 py-2 text-left transition ${
                  format === "shorts"
                    ? "border-violet-400 bg-violet-400/10"
                    : "border-white/10 bg-black/20 hover:border-white/30"
                }`}
              >
                <p className="text-sm font-semibold">📱 Reel / Shorts / TikTok</p>
                <p className="text-[11px] text-muted-foreground">
                  9:16 · vertical · duration in seconds
                </p>
              </button>
            </div>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Project title</Label>
            <Input id="title" name="title" placeholder="The Lantern in the Fog" required />
          </div>

          <div className="space-y-2">
            <Label>Script source</Label>
            <Select defaultValue="manual" name="storySourceType">
              <SelectTrigger>
                <SelectValue placeholder="Choose source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Write script manually</SelectItem>
                <SelectItem value="ai_chat">Generate with AI chat</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>
              Duration{" "}
              <span className="text-muted-foreground">
                ({format === "shorts" ? "seconds" : "minutes"})
              </span>
            </Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {choices.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Genre / style</Label>
            <Select defaultValue="mystery" name="genre">
              <SelectTrigger>
                <SelectValue placeholder="Choose genre" />
              </SelectTrigger>
              <SelectContent>
                {genreOptions.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Input id="language" name="language" defaultValue="English" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="hookText">
              Hook headline{" "}
              <span className="text-muted-foreground">
                (shown for 3s over the opening)
              </span>
            </Label>
            <Input
              id="hookText"
              name="hookText"
              placeholder="e.g. YOU WON'T BELIEVE WHAT HAPPENED NEXT"
            />
          </div>

          <div className="md:col-span-2 space-y-3">
            {error ? (
              <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            ) : null}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Creating..." : "Create project"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
