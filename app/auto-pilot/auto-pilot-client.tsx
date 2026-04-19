"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, CheckCircle2, Loader2, AlertCircle, RefreshCw, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { genreOptions } from "@/lib/constants";

type StageId = "project" | "script" | "scenes" | "images" | "voice";
type StageStatus = "idle" | "running" | "confirm" | "done" | "error";

type Stage = {
  id: StageId;
  label: string;
  description: string;
};

const STAGES: Stage[] = [
  {
    id: "project",
    label: "Create project",
    description: "Spins up a new project with your title, format, duration, and hook."
  },
  {
    id: "script",
    label: "Write script",
    description: "Uses OpenAI + live web search for current topics. Writes a viral hook + CTA."
  },
  {
    id: "scenes",
    label: "Plan scenes",
    description: "Splits the script into variable-length scene beats via Gemini."
  },
  {
    id: "images",
    label: "Generate images",
    description: "Creates a cinematic image per scene. Runs in parallel batches."
  },
  {
    id: "voice",
    label: "Generate narration",
    description: "ElevenLabs TTS, tuned for natural cadence."
  }
];

interface ScenePreview {
  id: string;
  order: number;
  narrationText: string;
  subtitleText: string;
  durationSec: number;
  imageUrl?: string | null;
}

interface SceneImage {
  sceneId: string;
  order: number;
  imageUrl: string;
  narrationText: string;
}

export function AutoPilotClient() {
  const router = useRouter();

  // Format: drives BOTH aspect ratio and which duration presets are shown.
  //   "longform" → 16:9, duration in minutes (1, 3, 5, 10)
  //   "shorts"   → 9:16, duration in seconds (10, 15, 20, 30, 45, 60)
  const [format, setFormat] = useState<"longform" | "shorts">("longform");

  // Form fields
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [hookText, setHookText] = useState("");
  // Trending topics
  const [niche, setNiche] = useState("");
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingError, setTrendingError] = useState<string | null>(null);
  const [trendingTopics, setTrendingTopics] = useState<
    Array<{ title: string; angle: string; hook: string; whyNow: string }>
  >([]);
  const [genre, setGenre] = useState("realistic");
  const [language, setLanguage] = useState("English");
  const [targetDurationSec, setTargetDurationSec] = useState(180);
  const [aspectRatio, setAspectRatio] = useState<"16:9" | "9:16">("16:9");

  // Keep format + aspect + sensible duration in sync when user switches format.
  function setFormatAndSync(next: "longform" | "shorts") {
    setFormat(next);
    if (next === "shorts") {
      setAspectRatio("9:16");
      // If current duration is more than 90s, snap down to a shorts default.
      if (targetDurationSec > 90) setTargetDurationSec(30);
    } else {
      setAspectRatio("16:9");
      // If current duration is less than 60s, bump up to a long-form default.
      if (targetDurationSec < 60) setTargetDurationSec(180);
    }
  }

  // Duration presets switch with format.
  const longformDurations: Array<{ label: string; value: number }> = [
    { label: "1 min", value: 60 },
    { label: "3 min", value: 180 },
    { label: "5 min", value: 300 },
    { label: "10 min", value: 600 },
    { label: "15 min", value: 900 }
  ];
  const shortsDurations: Array<{ label: string; value: number }> = [
    { label: "10s", value: 10 },
    { label: "15s", value: 15 },
    { label: "20s", value: 20 },
    { label: "30s", value: 30 },
    { label: "45s", value: 45 },
    { label: "60s", value: 60 },
    { label: "90s", value: 90 }
  ];
  const durationChoices = format === "shorts" ? shortsDurations : longformDurations;

  // Stage state
  const [stageStatus, setStageStatus] = useState<Record<StageId, StageStatus>>({
    project: "idle",
    script: "idle",
    scenes: "idle",
    images: "idle",
    voice: "idle"
  });
  const [stageError, setStageError] = useState<Record<StageId, string | null>>({
    project: null,
    script: null,
    scenes: null,
    images: null,
    voice: null
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string>("");
  const [generatedTitle, setGeneratedTitle] = useState<string>("");
  const [scenes, setScenes] = useState<ScenePreview[]>([]);
  const [imagesDone, setImagesDone] = useState<number>(0);
  const [sceneImages, setSceneImages] = useState<SceneImage[]>([]);
  const [enlargedImage, setEnlargedImage] = useState<SceneImage | null>(null);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(null);

  const anyRunning = Object.values(stageStatus).some((s) => s === "running");
  const canStart = prompt.trim().length > 10 && !anyRunning;

  async function loadTrending() {
    if (!niche.trim()) return;
    setTrendingLoading(true);
    setTrendingError(null);
    try {
      const res = await fetch("/api/auto-pilot/trending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          niche,
          format: targetDurationSec <= 60 ? "shorts" : "youtube-longform",
          count: 5
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed");
      setTrendingTopics(payload.topics ?? []);
    } catch (e) {
      setTrendingError(e instanceof Error ? e.message : "Failed");
    } finally {
      setTrendingLoading(false);
    }
  }

  function adoptTopic(t: { title: string; angle: string; hook: string; whyNow: string }) {
    setTitle(t.title);
    setHookText(t.hook);
    setPrompt(
      `${t.angle}\n\nWhy now: ${t.whyNow}\n\nWrite a ${targetDurationSec <= 60 ? "60-second Shorts" : "long-form YouTube"} script with a strong opening hook and a call-to-action at the end.`
    );
    setTrendingTopics([]);
  }

  function patch(stage: StageId, status: StageStatus, error: string | null = null) {
    setStageStatus((s) => ({ ...s, [stage]: status }));
    setStageError((s) => ({ ...s, [stage]: error }));
  }

  // --- Stage runners ---
  async function runProject(): Promise<string> {
    patch("project", "running");
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "Untitled",
        storySourceType: "ai_chat",
        targetDurationSec,
        genre,
        language,
        aspectRatio,
        hookText
      })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Failed to create project");
    const id = payload.project.id as string;
    setProjectId(id);
    patch("project", "done");
    return id;
  }

  async function runScript(id: string) {
    patch("script", "running");
    const res = await fetch("/api/scripts/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, genre, language, targetDurationSec })
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Script failed");

    // Save onto project
    const saveRes = await fetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: payload.title || title || "Untitled",
        script: payload.story
      })
    });
    if (!saveRes.ok) throw new Error((await saveRes.json())?.error ?? "Script save failed");

    setGeneratedTitle(payload.title ?? "");
    setGeneratedScript(payload.story);
    patch("script", "confirm");
  }

  async function runScenes(id: string) {
    patch("scenes", "running");
    const res = await fetch(`/api/projects/${id}/scenes/generate`, { method: "POST" });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Scene planning failed");
    setScenes(payload.scenes);
    patch("scenes", "confirm");
  }

  async function runImages(id: string) {
    patch("images", "running");
    setImagesDone(0);
    const res = await fetch(`/api/projects/${id}/images/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = await res.json();
    if (!res.ok) throw new Error(payload.error ?? "Image generation failed");
    setImagesDone(payload.results?.length ?? 0);
    await loadSceneImages(id);
    patch("images", "confirm");
  }

  async function loadSceneImages(id: string) {
    const res = await fetch(`/api/projects/${id}`, { cache: "no-store" });
    if (!res.ok) return;
    const payload = await res.json();
    const list: SceneImage[] = (payload.project?.scenes ?? [])
      .filter((s: { imageUrl?: string | null }) => s.imageUrl)
      .map((s: { id: string; order: number; imageUrl: string; narrationText: string }) => ({
        sceneId: s.id,
        order: s.order,
        imageUrl: s.imageUrl,
        narrationText: s.narrationText
      }));
    setSceneImages(list);
  }

  async function regenerateSceneImage(sceneId: string) {
    if (!projectId) return;
    setRegeneratingSceneId(sceneId);
    try {
      const res = await fetch(`/api/projects/${projectId}/images/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneId })
      });
      if (!res.ok) throw new Error((await res.json())?.error ?? "Regen failed");
      await loadSceneImages(projectId);
      // If the regenerated scene is currently enlarged, force a re-read of its
      // new URL (which was just updated via loadSceneImages above).
      setEnlargedImage((current) => {
        if (!current || current.sceneId !== sceneId) return current;
        // Re-fetch from freshly-loaded sceneImages by sceneId — but because
        // setState batches, we grab the latest via a side-effect. Simplest:
        // bust the URL with a cache-busting query param so the <img> re-requests.
        return { ...current, imageUrl: `${current.imageUrl.split("?")[0]}?t=${Date.now()}` };
      });
    } catch (e) {
      patch(
        "images",
        "error",
        e instanceof Error ? e.message : "Regeneration failed"
      );
    } finally {
      setRegeneratingSceneId(null);
    }
  }

  async function runVoice(id: string) {
    patch("voice", "running");
    const res = await fetch("/api/voice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, text: generatedScript })
    });
    if (!res.ok) throw new Error((await res.json())?.error ?? "Voice failed");
    patch("voice", "done");
  }

  // Orchestrator: runs stages, pauses at each "confirm" gate.
  async function start() {
    try {
      const id = projectId ?? (await runProject());
      await runScript(id);
      // Script needs user confirmation before scenes.
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed";
      patch(stageStatus.project !== "done" ? "project" : "script", "error", msg);
    }
  }

  async function confirmScriptAndContinue() {
    if (!projectId) return;
    try {
      patch("script", "done");
      await runScenes(projectId);
    } catch (e) {
      patch("scenes", "error", e instanceof Error ? e.message : "Failed");
    }
  }

  async function confirmScenesAndContinue() {
    if (!projectId) return;
    try {
      patch("scenes", "done");
      await runImages(projectId);
    } catch (e) {
      patch("images", "error", e instanceof Error ? e.message : "Failed");
    }
  }

  async function confirmImagesAndContinue() {
    if (!projectId) return;
    try {
      patch("images", "done");
      await runVoice(projectId);
    } catch (e) {
      patch("voice", "error", e instanceof Error ? e.message : "Failed");
    }
  }

  async function retryStage(stage: StageId) {
    if (!projectId && stage !== "project") return;
    try {
      if (stage === "project") await runProject();
      else if (stage === "script") await runScript(projectId!);
      else if (stage === "scenes") await runScenes(projectId!);
      else if (stage === "images") await runImages(projectId!);
      else if (stage === "voice") await runVoice(projectId!);
    } catch (e) {
      patch(stage, "error", e instanceof Error ? e.message : "Failed");
    }
  }

  // --- Render ---
  const started = Object.values(stageStatus).some((s) => s !== "idle");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      {/* LEFT — input form + stage list */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Trending ideas (optional)</CardTitle>
            <CardDescription>
              Paste a niche; we&apos;ll web-search 5 fresh angles you can ship this
              week. One click fills in the prompt below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder='e.g. "AI news", "personal finance", "crypto"'
                value={niche}
                onChange={(e) => setNiche(e.target.value)}
                disabled={started}
              />
              <Button
                onClick={loadTrending}
                disabled={!niche.trim() || trendingLoading || started}
              >
                <TrendingUp className="mr-2 h-4 w-4" />
                {trendingLoading ? "Searching…" : "Find ideas"}
              </Button>
            </div>
            {trendingError ? (
              <p className="text-xs text-red-400">{trendingError}</p>
            ) : null}
            {trendingTopics.length > 0 ? (
              <div className="space-y-2">
                {trendingTopics.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => adoptTopic(t)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left hover:border-cyan-400 hover:bg-white/[0.05]"
                  >
                    <p className="font-semibold">{t.title}</p>
                    <p className="mt-1 text-xs text-slate-300">{t.angle}</p>
                    <p className="mt-1 text-xs text-cyan-300">Hook: {t.hook}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      <TrendingUp className="mr-1 inline h-3 w-3" />
                      {t.whyNow}
                    </p>
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Describe what to make</CardTitle>
            <CardDescription>
              Be specific. Include topic, angle, tone, audience. We&apos;ll search
              the web automatically for anything time-sensitive.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Textarea
              rows={5}
              placeholder={`e.g.
"60s Shorts explaining the latest Iran-Israel escalation, news-anchor tone, for a general audience"
"3-minute explainer: why the dollar is weakening — retail-investor audience"
"5-minute slow-burn horror story set in a disused subway station"`}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={started}
            />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="title">Title (optional)</Label>
                <Input
                  id="title"
                  placeholder="Leave blank — AI picks one"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={started}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hook">Hook headline (optional)</Label>
                <Input
                  id="hook"
                  placeholder="Shown for first 3 seconds"
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  disabled={started}
                />
              </div>
              {/* Format picker — drives aspect ratio + duration units */}
              <div className="space-y-1.5 md:col-span-2">
                <Label>Format</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={started}
                    onClick={() => setFormatAndSync("longform")}
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
                    disabled={started}
                    onClick={() => setFormatAndSync("shorts")}
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

              <div className="space-y-1.5">
                <Label>
                  Duration{" "}
                  <span className="text-muted-foreground">
                    ({format === "shorts" ? "seconds" : "minutes"})
                  </span>
                </Label>
                <Select
                  value={String(targetDurationSec)}
                  onValueChange={(v) => setTargetDurationSec(Number(v))}
                  disabled={started}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {durationChoices.map((d) => (
                      <SelectItem key={d.value} value={String(d.value)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Aspect ratio</Label>
                <div className="flex h-10 items-center rounded-xl border border-white/10 bg-black/10 px-3 text-sm text-muted-foreground">
                  {aspectRatio} ·{" "}
                  {aspectRatio === "16:9" ? "YouTube long-form" : "Shorts / Reels / TikTok"}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Locked to the selected format.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Genre / style</Label>
                <Select value={genre} onValueChange={setGenre} disabled={started}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {genreOptions.map((g) => (
                      <SelectItem key={g} value={g}>
                        {g}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lang">Language</Label>
                <Input
                  id="lang"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  disabled={started}
                />
              </div>
            </div>

            <Button onClick={start} disabled={!canStart || started} size="lg" className="w-full">
              <Rocket className="mr-2 h-4 w-4" />
              {started ? "Running…" : "Start Auto-Pilot"}
            </Button>
          </CardContent>
        </Card>

        {/* Stage list (passive, mirrors the detailed right-hand panel) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {STAGES.map((s, i) => {
              const status = stageStatus[s.id];
              return (
                <div
                  key={s.id}
                  className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2"
                >
                  <div className="mt-0.5">{stageIcon(status)}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {i + 1}. {s.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* RIGHT — live stage detail + confirms */}
      <div className="space-y-4">
        <StageCard
          stage="script"
          status={stageStatus.script}
          error={stageError.script}
          title="Script"
          description="Review before scenes. This is what will be narrated."
          onRetry={() => retryStage("script")}
          onConfirm={confirmScriptAndContinue}
          confirmLabel="Looks good → Plan scenes"
        >
          {generatedScript ? (
            <div className="space-y-2">
              {generatedTitle ? (
                <p className="text-sm font-semibold">{generatedTitle}</p>
              ) : null}
              <Textarea
                className="min-h-[200px]"
                value={generatedScript}
                onChange={(e) => setGeneratedScript(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (!projectId) return;
                  await fetch(`/api/projects/${projectId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ script: generatedScript })
                  });
                }}
              >
                Save edits
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Start Auto-Pilot to generate the script.
            </p>
          )}
        </StageCard>

        <StageCard
          stage="scenes"
          status={stageStatus.scenes}
          error={stageError.scenes}
          title="Scenes"
          description="Variable-length beats. Review, then we'll generate an image per beat."
          onRetry={() => retryStage("scenes")}
          onConfirm={confirmScenesAndContinue}
          confirmLabel="Accept scenes → Generate images"
        >
          {scenes.length > 0 ? (
            <div className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {scenes.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold">Scene {s.order}</span>
                    <span className="text-muted-foreground">
                      {s.durationSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="text-slate-200">{s.narrationText}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Waiting for script…</p>
          )}
        </StageCard>

        <StageCard
          stage="images"
          status={stageStatus.images}
          error={stageError.images}
          title="Images"
          description="Click a thumbnail to enlarge. Regenerate any that don't match."
          onRetry={() => retryStage("images")}
          onConfirm={confirmImagesAndContinue}
          confirmLabel="Accept images → Generate narration"
        >
          {stageStatus.images === "running" ? (
            <p className="text-xs text-muted-foreground">
              Generating image for each scene… (can take 1–2 min for longer videos)
            </p>
          ) : sceneImages.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {sceneImages.length} image{sceneImages.length === 1 ? "" : "s"} ready.
                Click any to enlarge; hit regenerate if one&apos;s off.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {sceneImages.map((img) => (
                  <div
                    key={img.sceneId}
                    className="group relative overflow-hidden rounded-lg border border-white/10 bg-black/20"
                  >
                    <button
                      type="button"
                      onClick={() => setEnlargedImage(img)}
                      className="block aspect-video w-full"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.imageUrl}
                        alt={`Scene ${img.order}`}
                        className="h-full w-full object-cover transition group-hover:scale-105"
                      />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-[10px]">
                      <span className="font-semibold text-white">
                        Scene {img.order}
                      </span>
                      <button
                        type="button"
                        disabled={regeneratingSceneId === img.sceneId}
                        onClick={(e) => {
                          e.stopPropagation();
                          void regenerateSceneImage(img.sceneId);
                        }}
                        className="rounded bg-white/20 px-1.5 py-0.5 text-white hover:bg-white/30 disabled:opacity-40"
                      >
                        {regeneratingSceneId === img.sceneId ? "…" : "↻"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {stageStatus.images === "idle"
                ? "Waiting for scene approval."
                : "Loading images…"}
            </p>
          )}
        </StageCard>

        {/* Enlarged image preview — a simple dark backdrop with click-to-close. */}
        {enlargedImage ? (
          <div
            onClick={() => setEnlargedImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 backdrop-blur"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="relative max-h-full w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={enlargedImage.imageUrl}
                alt={`Scene ${enlargedImage.order}`}
                className="max-h-[80vh] w-full object-contain"
              />
              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/60 p-3">
                <div>
                  <p className="text-sm font-semibold">Scene {enlargedImage.order}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {enlargedImage.narrationText}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={regeneratingSceneId === enlargedImage.sceneId}
                    onClick={() => {
                      void regenerateSceneImage(enlargedImage.sceneId);
                    }}
                  >
                    <RefreshCw className="mr-2 h-3 w-3" />
                    {regeneratingSceneId === enlargedImage.sceneId
                      ? "Regenerating…"
                      : "Regenerate"}
                  </Button>
                  <Button size="sm" onClick={() => setEnlargedImage(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        <StageCard
          stage="voice"
          status={stageStatus.voice}
          error={stageError.voice}
          title="Narration"
          description="ElevenLabs TTS. Opens the video editor when done."
          onRetry={() => retryStage("voice")}
          hideConfirm
        >
          {stageStatus.voice === "done" && projectId ? (
            <div className="space-y-2">
              <p className="text-xs text-emerald-300">
                All set — narration ready. Jump into the editor to tweak motion,
                transitions, add music, and export.
              </p>
              <Button asChild className="w-full">
                <Link href={`/video-editor?projectId=${projectId}`}>
                  Open in Video Editor
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Will run after you confirm images.
            </p>
          )}
        </StageCard>
      </div>
    </div>
  );
}

function stageIcon(status: StageStatus) {
  if (status === "running")
    return <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />;
  if (status === "confirm")
    return <AlertCircle className="h-4 w-4 text-amber-300" />;
  if (status === "done") return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (status === "error") return <AlertCircle className="h-4 w-4 text-red-400" />;
  return <div className="h-4 w-4 rounded-full border border-white/20" />;
}

function StageCard({
  stage,
  status,
  error,
  title,
  description,
  onRetry,
  onConfirm,
  confirmLabel,
  hideConfirm,
  children
}: {
  stage: StageId;
  status: StageStatus;
  error: string | null;
  title: string;
  description: string;
  onRetry: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  hideConfirm?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card
      className={
        status === "confirm"
          ? "border-amber-400/40"
          : status === "error"
            ? "border-red-500/40"
            : status === "done"
              ? "border-emerald-500/30"
              : ""
      }
    >
      <CardHeader className="flex-row items-start justify-between space-y-0 pb-3">
        <div className="flex items-start gap-2">
          <div className="mt-0.5">{stageIcon(status)}</div>
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {status}
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {children}
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {error}
            <button
              onClick={onRetry}
              className="ml-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-red-100 hover:bg-red-500/20"
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </button>
          </div>
        ) : null}
        {!hideConfirm && status === "confirm" && onConfirm ? (
          <div className="flex gap-2">
            <Button onClick={onConfirm} size="sm" className="flex-1">
              {confirmLabel ?? "Accept"}
            </Button>
            <Button
              onClick={onRetry}
              variant="outline"
              size="sm"
              title="Regenerate this stage"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
