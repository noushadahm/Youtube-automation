import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Settings</p>
        <h2 className="font-display text-5xl">Provider defaults and output preferences.</h2>
      </div>
      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle>Default settings</CardTitle>
          <CardDescription>Per-user defaults for voices, subtitle styling, and output format.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Default voice ID</Label>
            <Input placeholder="Pulled from backend settings" />
          </div>
          <div className="space-y-2">
            <Label>ElevenLabs model</Label>
            <Input placeholder="eleven_multilingual_v2" />
          </div>
          <div className="space-y-2">
            <Label>Subtitle style defaults</Label>
            <Input placeholder="White text, dark background, bottom center safe zone" />
          </div>
          <div className="space-y-2">
            <Label>Output default</Label>
            <Input placeholder="16:9 landscape or 9:16 shorts" />
          </div>
          <div className="md:col-span-2">
            <Button>Save settings</Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
