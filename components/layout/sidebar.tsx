"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { Clapperboard, Film, LayoutDashboard, Mic2, PictureInPicture2, Settings2, Sparkles, UploadCloud, Wand2 } from "lucide-react";
import { APP_NAME, sidebarItems } from "@/lib/constants";
import { cn } from "@/lib/utils";

const iconMap = [
  LayoutDashboard,
  Sparkles,
  Wand2,
  Mic2,
  Film,
  PictureInPicture2,
  Clapperboard,
  Clapperboard,
  UploadCloud,
  Settings2
];

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const studioRoutes = new Set([
    "/script-studio",
    "/voice-studio",
    "/scene-studio",
    "/image-studio",
    "/video-editor",
    "/reel-studio",
    "/exports"
  ]);

  return (
    <aside className="glass-panel sticky top-0 flex h-screen w-72 flex-col border-r border-white/10 px-5 py-6">
      <div className="mb-8 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-cyan-400 text-slate-950">
          <Film className="h-6 w-6" />
        </div>
        <div>
          <p className="font-display text-2xl font-semibold tracking-wide">{APP_NAME}</p>
          <p className="text-xs text-muted-foreground">AI video story pipeline</p>
        </div>
      </div>

      <nav className="space-y-1">
        {sidebarItems.map((item, index) => {
          const Icon = iconMap[index];
          const active = pathname === item.href;
          const href =
            projectId && studioRoutes.has(item.href) ? `${item.href}?projectId=${projectId}` : item.href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                active ? "bg-white/12 text-white" : "text-muted-foreground hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-3xl border border-white/10 bg-gradient-to-br from-amber-500/20 via-white/5 to-cyan-400/20 p-4">
        <p className="text-sm font-semibold">Automatic mode</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Script, scenes, images, subtitles, audio, and render orchestration all flow from one project pipeline.
        </p>
      </div>
    </aside>
  );
}
