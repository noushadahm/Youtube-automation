import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { SettingsForm } from "./form";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const s = await db.settings.findUnique({ where: { userId: user.id } });

  const mask = (k: string | null | undefined) =>
    k ? `${k.slice(0, 4)}••••${k.slice(-4)}` : "";

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Settings</p>
        <h2 className="font-display text-5xl">Your API keys, voice tuning, and model overrides.</h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          All keys are stored server-side and never exposed to your browser. Leaving a
          key field blank keeps the existing value.
        </p>
      </div>

      <div className="grid max-w-4xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Signed in as</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>API keys &amp; preferences</CardTitle>
            <CardDescription>
              OpenAI (script), Gemini (scenes / images / AI video via Veo), ElevenLabs (voice).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SettingsForm
              initial={{
                hasOpenAiApiKey: Boolean(s?.openAiApiKey),
                hasGeminiApiKey: Boolean(s?.geminiApiKey),
                hasElevenLabsApiKey: Boolean(s?.elevenLabsApiKey),
                hasTavilyApiKey: Boolean(s?.tavilyApiKey),
                hasNewsApiKey: Boolean(s?.newsApiKey),
                openAiApiKeyMasked: mask(s?.openAiApiKey),
                geminiApiKeyMasked: mask(s?.geminiApiKey),
                elevenLabsApiKeyMasked: mask(s?.elevenLabsApiKey),
                tavilyApiKeyMasked: mask(s?.tavilyApiKey),
                newsApiKeyMasked: mask(s?.newsApiKey),
                defaultVoiceId: s?.defaultVoiceId ?? "",
                defaultElevenLabsModel: s?.defaultElevenLabsModel ?? "",
                defaultAspectRatio: s?.defaultAspectRatio ?? "",
                defaultSubtitleStyle: s?.defaultSubtitleStyle ?? "",
                geminiImageModel: s?.geminiImageModel ?? "",
                geminiVideoModel: s?.geminiVideoModel ?? "",
                voiceStability: s?.voiceStability ?? null,
                voiceSimilarityBoost: s?.voiceSimilarityBoost ?? null,
                voiceStyle: s?.voiceStyle ?? null,
                voiceSpeakerBoost: s?.voiceSpeakerBoost ?? null
              }}
            />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
