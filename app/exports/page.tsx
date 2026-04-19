import { Download, FileText, Film } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getActiveProject } from "@/lib/project-context";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ExportsPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const user = await requireUser();
  const project = await getActiveProject(searchParams?.projectId);

  // If a specific project is active, scope to it — otherwise show all videos.
  const whereAssets = project
    ? { type: "video" as const, projectId: project.id }
    : { type: "video" as const, project: { userId: user.id } };

  const videos = await db.asset.findMany({
    where: whereAssets,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, title: true, aspectRatio: true } },
      scene: false
    }
  });

  // Subtitle SRTs per project so we can offer an SRT download next to each MP4.
  const projectIds = Array.from(new Set(videos.map((v) => v.projectId)));
  const subtitles =
    projectIds.length === 0
      ? []
      : await db.asset.findMany({
          where: { type: "subtitle", projectId: { in: projectIds } },
          orderBy: { createdAt: "desc" }
        });
  const latestSrtByProject = new Map<string, (typeof subtitles)[number]>();
  for (const srt of subtitles) {
    if (!latestSrtByProject.has(srt.projectId)) {
      latestSrtByProject.set(srt.projectId, srt);
    }
  }

  // Split videos by kind so long-form renders and vertical shorts list separately.
  const shorts = videos.filter(
    (v) => (v.metadataJson as { kind?: string } | null)?.kind === "short"
  );
  const longForm = videos.filter(
    (v) => (v.metadataJson as { kind?: string } | null)?.kind !== "short"
  );

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Exports</p>
        <h2 className="font-display text-5xl">Download renders and subtitle packages.</h2>
      </div>
      <ProjectContextBar project={project} />

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Completed renders</CardTitle>
          <CardDescription>
            Final MP4 files, subtitle exports, and render metadata.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {longForm.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No renders yet. Finish a project and click <em>Render</em> to see
              output files here.
            </p>
          ) : (
            longForm.map((video) => {
              const meta =
                (video.metadataJson as { kind?: string; aspectRatio?: string } | null) ??
                null;
              const aspect = meta?.aspectRatio ?? video.project.aspectRatio ?? "";
              const kindLabel = meta?.kind === "reel" ? "Reel" : "Video";
              const srt = latestSrtByProject.get(video.projectId);
              return (
                <div
                  key={video.id}
                  className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold">{video.project.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {kindLabel}
                      {aspect ? ` • ${aspect}` : ""} •{" "}
                      {formatDistanceToNow(video.createdAt, { addSuffix: true })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button asChild variant="outline">
                      <a href={`/api/assets/${video.id}`} target="_blank" rel="noreferrer">
                        <Film className="mr-2 h-4 w-4" />
                        MP4
                      </a>
                    </Button>
                    {srt ? (
                      <Button asChild variant="outline">
                        <a href={`/api/assets/${srt.id}`} target="_blank" rel="noreferrer">
                          <FileText className="mr-2 h-4 w-4" />
                          SRT
                        </a>
                      </Button>
                    ) : null}
                    <Button asChild>
                      <a href={`/api/assets/${video.id}?download=1`}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {shorts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Shorts</CardTitle>
            <CardDescription>
              9:16 clips sliced from your long-form renders. Ready to upload to
              YouTube Shorts, Reels, or TikTok.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {shorts.map((short) => {
              const meta =
                (short.metadataJson as {
                  label?: string;
                  startSec?: number;
                  endSec?: number;
                  durationSec?: number;
                } | null) ?? null;
              return (
                <div
                  key={short.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <video
                    className="aspect-[9/16] w-full bg-black"
                    src={`/api/assets/${short.id}`}
                    controls
                  />
                  <div className="p-3">
                    <p className="truncate text-sm font-semibold">
                      {meta?.label ?? "Short"}{" "}
                      <span className="text-xs text-muted-foreground">
                        · {short.project.title}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {meta?.durationSec
                        ? `${meta.durationSec.toFixed(0)}s`
                        : `${formatDistanceToNow(short.createdAt, { addSuffix: true })}`}
                    </p>
                    <Button asChild size="sm" className="mt-2 w-full">
                      <a href={`/api/assets/${short.id}?download=1`}>
                        <Download className="mr-2 h-3 w-3" /> Download
                      </a>
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ) : null}
    </AppShell>
  );
}
