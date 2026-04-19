import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectList } from "@/components/dashboard/project-list";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();

  const [projectCount, renderCount, sceneCount, recentVideos] = await Promise.all([
    db.project.count({ where: { userId: user.id } }),
    db.asset.count({
      where: { type: "video", project: { userId: user.id } }
    }),
    db.scene.count({ where: { project: { userId: user.id } } }),
    db.asset.findMany({
      where: { type: "video", project: { userId: user.id } },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { project: { select: { title: true, aspectRatio: true } } }
    })
  ]);

  return (
    <AppShell>
      <section className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Dashboard</p>
          <h2 className="font-display text-5xl leading-none">Build any video in one flow.</h2>
        </div>
        <Button asChild size="lg">
          <Link href="/projects/new">New Project</Link>
        </Button>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <StatCard
          title="Projects"
          value={projectCount.toString()}
          description="Drafts and active content in your workspace."
        />
        <StatCard
          title="Renders"
          value={renderCount.toString()}
          description="Video files produced across all your projects."
        />
        <StatCard
          title="Scenes generated"
          value={sceneCount.toString()}
          description="Scene breakdowns produced by the scene planner."
        />
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <ProjectList />
        <div className="glass-panel rounded-3xl p-6 shadow-soft">
          <p className="text-sm uppercase tracking-[0.3em] text-amber-300/80">Recent renders</p>
          <div className="mt-5 space-y-4">
            {recentVideos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No renders yet. Finish a project and render it to see it listed here.
              </p>
            ) : (
              recentVideos.map((asset) => {
                const meta =
                  (asset.metadataJson as { kind?: string } | null) ?? null;
                const kindLabel = meta?.kind === "reel" ? "Reel" : "Video";
                const aspect = asset.project?.aspectRatio ?? "";
                return (
                  <Link
                    key={asset.id}
                    href={`/api/assets/${asset.id}`}
                    className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
                  >
                    <p className="truncate font-semibold">
                      {asset.project?.title ?? "Untitled project"}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {kindLabel}
                      {aspect ? ` • ${aspect}` : ""} •{" "}
                      {formatDistanceToNow(asset.createdAt, { addSuffix: true })}
                    </p>
                  </Link>
                );
              })
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
