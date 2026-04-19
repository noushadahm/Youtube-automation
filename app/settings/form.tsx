"use client";

import { useState, useTransition } from "react";
import { ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface GeminiModel {
  id: string;
  displayName?: string;
  description?: string;
  likelyImage: boolean;
}

function GeminiModelPicker({ onPick }: { onPick: (m: string) => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<GeminiModel[]>([]);

  async function load() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/gemini-models", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error ?? "Failed to load");
      setModels(payload.models ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : void load())}
        className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-muted-foreground hover:bg-white/5 hover:text-white"
      >
        <ListFilter className="h-3 w-3" />
        {open ? "Hide models" : "Available models"}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-20 mt-1 max-h-96 w-[420px] overflow-y-auto rounded-xl border border-white/10 bg-slate-900 p-2 shadow-2xl">
          {loading ? (
            <p className="p-3 text-xs text-muted-foreground">Fetching…</p>
          ) : error ? (
            <p className="p-3 text-xs text-red-300">{error}</p>
          ) : models.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              No models visible. Save a Gemini key first, then refresh.
            </p>
          ) : (
            <>
              <p className="p-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                Click one to fill the image-model field
              </p>
              {models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onPick(m.id);
                    setOpen(false);
                  }}
                  className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-xs hover:bg-white/5 ${
                    m.likelyImage ? "bg-cyan-400/5" : ""
                  }`}
                  type="button"
                >
                  <span className="font-mono font-semibold text-slate-100">
                    {m.id}
                    {m.likelyImage ? (
                      <span className="ml-2 rounded bg-cyan-400/20 px-1 text-[10px] text-cyan-200">
                        image
                      </span>
                    ) : null}
                  </span>
                  {m.displayName ? (
                    <span className="text-muted-foreground">{m.displayName}</span>
                  ) : null}
                </button>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

interface InitialSettings {
  hasOpenAiApiKey: boolean;
  hasGeminiApiKey: boolean;
  hasElevenLabsApiKey: boolean;
  hasTavilyApiKey: boolean;
  hasNewsApiKey: boolean;
  openAiApiKeyMasked: string;
  geminiApiKeyMasked: string;
  elevenLabsApiKeyMasked: string;
  tavilyApiKeyMasked: string;
  newsApiKeyMasked: string;
  defaultVoiceId: string;
  defaultElevenLabsModel: string;
  defaultAspectRatio: string;
  defaultSubtitleStyle: string;
  geminiImageModel: string;
  geminiVideoModel: string;
  voiceStability: number | null;
  voiceSimilarityBoost: number | null;
  voiceStyle: number | null;
  voiceSpeakerBoost: boolean | null;
}

export function SettingsForm({ initial }: { initial: InitialSettings }) {
  const [openAiApiKey, setOpenAiApiKey] = useState("");
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState("");
  const [tavilyApiKey, setTavilyApiKey] = useState("");
  const [newsApiKey, setNewsApiKey] = useState("");
  const [defaultVoiceId, setDefaultVoiceId] = useState(initial.defaultVoiceId);
  const [defaultElevenLabsModel, setDefaultElevenLabsModel] = useState(
    initial.defaultElevenLabsModel
  );
  const [defaultAspectRatio, setDefaultAspectRatio] = useState(initial.defaultAspectRatio);
  const [defaultSubtitleStyle, setDefaultSubtitleStyle] = useState(initial.defaultSubtitleStyle);
  const [geminiImageModel, setGeminiImageModel] = useState(initial.geminiImageModel);
  const [geminiVideoModel, setGeminiVideoModel] = useState(initial.geminiVideoModel);
  const [voiceStability, setVoiceStability] = useState<number>(initial.voiceStability ?? 0.4);
  const [voiceSimilarityBoost, setVoiceSimilarityBoost] = useState<number>(
    initial.voiceSimilarityBoost ?? 0.8
  );
  const [voiceStyle, setVoiceStyle] = useState<number>(initial.voiceStyle ?? 0.35);
  const [voiceSpeakerBoost, setVoiceSpeakerBoost] = useState<boolean>(
    initial.voiceSpeakerBoost ?? true
  );
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string }>();

  const save = () => {
    setMessage(undefined);
    startTransition(async () => {
      const body = {
        openAiApiKey: openAiApiKey || undefined,
        geminiApiKey: geminiApiKey || undefined,
        elevenLabsApiKey: elevenLabsApiKey || undefined,
        tavilyApiKey: tavilyApiKey || undefined,
        newsApiKey: newsApiKey || undefined,
        defaultVoiceId: defaultVoiceId || undefined,
        defaultElevenLabsModel: defaultElevenLabsModel || undefined,
        defaultAspectRatio: defaultAspectRatio || undefined,
        defaultSubtitleStyle: defaultSubtitleStyle || undefined,
        geminiImageModel: geminiImageModel || undefined,
        geminiVideoModel: geminiVideoModel || undefined,
        voiceStability,
        voiceSimilarityBoost,
        voiceStyle,
        voiceSpeakerBoost
      };
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ tone: "error", text: payload.error ?? "Failed to save" });
        return;
      }
      setOpenAiApiKey("");
      setGeminiApiKey("");
      setElevenLabsApiKey("");
      setTavilyApiKey("");
      setNewsApiKey("");
      setMessage({ tone: "ok", text: "Saved." });
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="openAiApiKey">OpenAI API key</Label>
          <Input
            id="openAiApiKey"
            type="password"
            placeholder={initial.hasOpenAiApiKey ? `Saved (${initial.openAiApiKeyMasked})` : "sk-…"}
            value={openAiApiKey}
            onChange={(e) => setOpenAiApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="geminiApiKey">Gemini API key</Label>
          <Input
            id="geminiApiKey"
            type="password"
            placeholder={
              initial.hasGeminiApiKey ? `Saved (${initial.geminiApiKeyMasked})` : "AIza…"
            }
            value={geminiApiKey}
            onChange={(e) => setGeminiApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="elevenLabsApiKey">ElevenLabs API key</Label>
          <Input
            id="elevenLabsApiKey"
            type="password"
            placeholder={
              initial.hasElevenLabsApiKey
                ? `Saved (${initial.elevenLabsApiKeyMasked})`
                : "xi-…"
            }
            value={elevenLabsApiKey}
            onChange={(e) => setElevenLabsApiKey(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tavilyApiKey">
            Tavily API key <span className="text-muted-foreground">(optional · recommended)</span>
          </Label>
          <Input
            id="tavilyApiKey"
            type="password"
            placeholder={
              initial.hasTavilyApiKey ? `Saved (${initial.tavilyApiKeyMasked})` : "tvly-…"
            }
            value={tavilyApiKey}
            onChange={(e) => setTavilyApiKey(e.target.value)}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            Grounds scripts in real-time news. Free tier: 1000 searches/month.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="newsApiKey">
            NewsAPI key <span className="text-muted-foreground">(optional fallback)</span>
          </Label>
          <Input
            id="newsApiKey"
            type="password"
            placeholder={
              initial.hasNewsApiKey ? `Saved (${initial.newsApiKeyMasked})` : "your NewsAPI key"
            }
            value={newsApiKey}
            onChange={(e) => setNewsApiKey(e.target.value)}
            autoComplete="off"
          />
          <p className="text-[11px] text-muted-foreground">
            Used when Tavily isn&apos;t set. Free dev tier: 100 requests/day.
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        AI image-to-video uses Google Veo through your Gemini key — no extra
        subscription required.
      </p>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">Model overrides</p>
          <GeminiModelPicker onPick={(m) => setGeminiImageModel(m)} />
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="geminiImageModel">Gemini image model</Label>
            <Input
              id="geminiImageModel"
              placeholder="gemini-2.5-flash-image"
              value={geminiImageModel}
              onChange={(e) => setGeminiImageModel(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Leave blank to auto-try known good names. Click&nbsp;
              <em>Available models</em> to pick one your key has access to.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="geminiVideoModel">Gemini Veo video model</Label>
            <Input
              id="geminiVideoModel"
              placeholder="veo-2.0-generate-001"
              value={geminiVideoModel}
              onChange={(e) => setGeminiVideoModel(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <p className="mb-3 text-sm font-semibold">Voice tuning (ElevenLabs)</p>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="defaultVoiceId">Voice ID</Label>
            <Input
              id="defaultVoiceId"
              placeholder="e.g. 21m00Tcm4TlvDq8ikWAM"
              value={defaultVoiceId}
              onChange={(e) => setDefaultVoiceId(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="defaultElevenLabsModel">Model</Label>
            <Input
              id="defaultElevenLabsModel"
              placeholder="eleven_multilingual_v2"
              value={defaultElevenLabsModel}
              onChange={(e) => setDefaultElevenLabsModel(e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2 grid gap-5 md:grid-cols-3">
            <div>
              <Label>Stability: {voiceStability.toFixed(2)}</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="w-full"
                value={voiceStability}
                onChange={(e) => setVoiceStability(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">Lower = more expressive</p>
            </div>
            <div>
              <Label>Similarity boost: {voiceSimilarityBoost.toFixed(2)}</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="w-full"
                value={voiceSimilarityBoost}
                onChange={(e) => setVoiceSimilarityBoost(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">Higher = closer to voice</p>
            </div>
            <div>
              <Label>Style: {voiceStyle.toFixed(2)}</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                className="w-full"
                value={voiceStyle}
                onChange={(e) => setVoiceStyle(Number(e.target.value))}
              />
              <p className="text-[11px] text-muted-foreground">More = emotional range</p>
            </div>
          </div>
          <label className="md:col-span-2 flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={voiceSpeakerBoost}
              onChange={(e) => setVoiceSpeakerBoost(e.target.checked)}
            />
            Use speaker boost (crisper, clearer narration)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 grid gap-5 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="defaultAspectRatio">Default aspect ratio</Label>
          <Input
            id="defaultAspectRatio"
            placeholder="16:9 or 9:16"
            value={defaultAspectRatio}
            onChange={(e) => setDefaultAspectRatio(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="defaultSubtitleStyle">Subtitle style</Label>
          <Input
            id="defaultSubtitleStyle"
            placeholder="White text, dark background, bottom center"
            value={defaultSubtitleStyle}
            onChange={(e) => setDefaultSubtitleStyle(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
        {message ? (
          <span
            className={
              message.tone === "ok" ? "text-sm text-emerald-300" : "text-sm text-red-400"
            }
          >
            {message.text}
          </span>
        ) : null}
      </div>
    </div>
  );
}
