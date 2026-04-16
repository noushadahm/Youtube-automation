import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectList } from "@/components/dashboard/project-list";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <AppShell>
      <section className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Dashboard</p>
          <h2 className="font-display text-5xl leading-none">Build story videos in one flow.</h2>
        </div>
        <Button asChild size="lg">
          <Link href="/projects/new">New Project</Link>
        </Button>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <StatCard title="Projects" value="12" description="Drafts and active stories across manual and AI-assisted workflows." />
        <StatCard title="Recent renders" value="4" description="Completed exports with MP4 + SRT delivery in the last week." />
        <StatCard title="Automation rate" value="82%" description="Average share of the pipeline completed in full automatic mode." />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ProjectList />
        <div className="glass-panel rounded-3xl p-6 shadow-soft">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300/80">Recent renders</p>
          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="font-semibold">Lantern_Fog_Final_v03.mp4</p>
              <p className="mt-1 text-sm text-muted-foreground">1920x1080 • subtitles burned • SRT exported</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="font-semibold">Ghost_Train_Shorts_v01.mp4</p>
              <p className="mt-1 text-sm text-muted-foreground">1080x1920 • vertical shorts • ElevenLabs narration</p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
