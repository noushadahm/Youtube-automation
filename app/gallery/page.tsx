import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AppShell } from "@/components/layout/app-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ImageIcon, Music2, Mic2, Film, Scissors } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Gallery — one-stop browse / download view across ALL of a user's projects.
 * Organised by asset type: images / covers / audio / music / videos / shorts.
 */
export default async function GalleryPage() {
  const user = await requireUser();

  const assets = await db.asset.findMany({
    where: { project: { userId: user.id } },
    orderBy: { createdAt: "desc" },
    include: { project: { select: { id: true, title: true } } },
    take: 500
  });

  const isCover = (a: (typeof assets)[number]) =>
    (a.metadataJson as { kind?: string } | null)?.kind === "cover";
  const isSceneClip = (a: (typeof assets)[number]) =>
    (a.metadataJson as { kind?: string } | null)?.kind === "scene-clip";
  const isShort = (a: (typeof assets)[number]) =>
    (a.metadataJson as { kind?: string } | null)?.kind === "short";

  const scenesImages = assets.filter((a) => a.type === "image" && !isCover(a));
  const covers = assets.filter((a) => a.type === "image" && isCover(a));
  const narration = assets.filter((a) => a.type === "audio");
  const music = assets.filter((a) => a.type === "music");
  const finalVideos = assets.filter(
    (a) => a.type === "video" && !isShort(a) && !isSceneClip(a)
  );
  const shorts = assets.filter((a) => a.type === "video" && isShort(a));

  return (
    <AppShell>
      <div className="mb-6">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Gallery</p>
        <h2 className="font-display text-5xl leading-none">
          Everything you&apos;ve generated.
        </h2>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Images, covers, narration, music, final videos, and shorts — organised
          by type and linked back to their projects.
        </p>
      </div>

      <div className="space-y-8">
        <GallerySection
          title="Scene images"
          icon={<ImageIcon className="h-4 w-4 text-cyan-300" />}
          count={scenesImages.length}
        >
          {scenesImages.length === 0 ? (
            <EmptyHint text="Generate a project to fill this up." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              {scenesImages.slice(0, 48).map((a) => (
                <AssetTile
                  key={a.id}
                  href={`/api/assets/${a.id}`}
                  projectHref={`/video-editor?projectId=${a.project.id}`}
                  projectTitle={a.project.title}
                  createdAt={a.createdAt}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${a.id}`}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                </AssetTile>
              ))}
            </div>
          )}
        </GallerySection>

        <GallerySection
          title="Covers / thumbnails"
          icon={<ImageIcon className="h-4 w-4 text-amber-300" />}
          count={covers.length}
        >
          {covers.length === 0 ? (
            <EmptyHint text="No covers generated yet." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {covers.map((a) => (
                <AssetTile
                  key={a.id}
                  href={`/api/assets/${a.id}`}
                  projectHref={`/video-editor?projectId=${a.project.id}`}
                  projectTitle={a.project.title}
                  createdAt={a.createdAt}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/assets/${a.id}`}
                    alt=""
                    className="aspect-video w-full object-cover"
                  />
                </AssetTile>
              ))}
            </div>
          )}
        </GallerySection>

        <GallerySection
          title="Final videos"
          icon={<Film className="h-4 w-4 text-cyan-300" />}
          count={finalVideos.length}
        >
          {finalVideos.length === 0 ? (
            <EmptyHint text="Export a project to see it here." />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {finalVideos.map((a) => (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <video
                    className="aspect-video w-full bg-black"
                    src={`/api/assets/${a.id}`}
                    controls
                  />
                  <div className="flex items-center justify-between p-3">
                    <div className="truncate">
                      <p className="truncate text-sm font-semibold">{a.project.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDistanceToNow(a.createdAt, { addSuffix: true })}
                      </p>
                    </div>
                    <Button asChild size="sm">
                      <a href={`/api/assets/${a.id}?download=1`}>
                        <Download className="mr-1 h-3 w-3" /> MP4
                      </a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GallerySection>

        <GallerySection
          title="Shorts"
          icon={<Scissors className="h-4 w-4 text-violet-300" />}
          count={shorts.length}
        >
          {shorts.length === 0 ? (
            <EmptyHint text="Use Generate Shorts in the Video Editor after exporting a long-form." />
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
              {shorts.map((a) => (
                <div
                  key={a.id}
                  className="overflow-hidden rounded-2xl border border-white/10 bg-black/20"
                >
                  <video
                    className="aspect-[9/16] w-full bg-black"
                    src={`/api/assets/${a.id}`}
                    controls
                  />
                  <div className="p-2">
                    <p className="truncate text-xs font-medium">{a.project.title}</p>
                    <a
                      className="mt-1 block text-center text-[11px] text-cyan-300 hover:underline"
                      href={`/api/assets/${a.id}?download=1`}
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GallerySection>

        <GallerySection
          title="Narration audio"
          icon={<Mic2 className="h-4 w-4 text-emerald-300" />}
          count={narration.length}
        >
          {narration.length === 0 ? (
            <EmptyHint text="Generate narration in Voice Studio or Auto-Pilot." />
          ) : (
            <div className="space-y-2">
              {narration.map((a) => (
                <AudioRow
                  key={a.id}
                  id={a.id}
                  label="Narration"
                  projectTitle={a.project.title}
                  projectHref={`/video-editor?projectId=${a.project.id}`}
                  createdAt={a.createdAt}
                />
              ))}
            </div>
          )}
        </GallerySection>

        <GallerySection
          title="Music / SFX"
          icon={<Music2 className="h-4 w-4 text-violet-300" />}
          count={music.length}
        >
          {music.length === 0 ? (
            <EmptyHint text="Upload or AI-generate music in the Video Editor." />
          ) : (
            <div className="space-y-2">
              {music.map((a) => {
                const meta = (a.metadataJson as { label?: string } | null) ?? null;
                return (
                  <AudioRow
                    key={a.id}
                    id={a.id}
                    label={meta?.label ?? "Music"}
                    projectTitle={a.project.title}
                    projectHref={`/video-editor?projectId=${a.project.id}`}
                    createdAt={a.createdAt}
                  />
                );
              })}
            </div>
          )}
        </GallerySection>
      </div>
    </AppShell>
  );
}

function GallerySection({
  title,
  icon,
  count,
  children
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          {icon}
          <CardTitle className="text-base">{title}</CardTitle>
          <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-muted-foreground">
            {count}
          </span>
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground">{text}</p>;
}

function AssetTile({
  href,
  projectHref,
  projectTitle,
  createdAt,
  children
}: {
  href: string;
  projectHref: string;
  projectTitle: string;
  createdAt: Date;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
      <div className="space-y-0.5 p-2">
        <Link
          href={projectHref}
          className="block truncate text-[11px] font-medium text-slate-100 hover:underline"
        >
          {projectTitle}
        </Link>
        <p className="truncate text-[10px] text-muted-foreground">
          {formatDistanceToNow(createdAt, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

function AudioRow({
  id,
  label,
  projectTitle,
  projectHref,
  createdAt
}: {
  id: string;
  label: string;
  projectTitle: string;
  projectHref: string;
  createdAt: Date;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
      <audio controls src={`/api/assets/${id}`} className="flex-1" />
      <div className="hidden min-w-0 md:block">
        <p className="truncate text-sm">{label}</p>
        <Link
          href={projectHref}
          className="truncate text-[11px] text-muted-foreground hover:text-white"
        >
          {projectTitle} · {formatDistanceToNow(createdAt, { addSuffix: true })}
        </Link>
      </div>
      <Button asChild size="sm" variant="outline">
        <a href={`/api/assets/${id}?download=1`}>
          <Download className="h-3 w-3" />
        </a>
      </Button>
    </div>
  );
}
