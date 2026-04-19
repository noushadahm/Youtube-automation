import { AppShell } from "@/components/layout/app-shell";
import { AutoPilotClient } from "./auto-pilot-client";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AutoPilotPage() {
  await requireUser();
  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Auto-Pilot</p>
        <h2 className="font-display text-5xl leading-none">One prompt. Full video.</h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Describe what you want. We&apos;ll search the web for fresh info, write a
          hook-driven script, split it into scenes, generate each image,
          narrate it, and hand you back a render-ready project. Confirm each
          step before moving on.
        </p>
      </div>
      <AutoPilotClient />
    </AppShell>
  );
}
