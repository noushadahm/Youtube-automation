import Link from "next/link";
import { ArrowLeft, Settings as SettingsIcon } from "lucide-react";
import { getActiveProject } from "@/lib/project-context";
import { getCurrentUser } from "@/lib/auth";
import { VideoEditorPanel } from "@/components/studio/video-editor-panel";

export const dynamic = "force-dynamic";

export default async function VideoEditorPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const [project, user] = await Promise.all([
    getActiveProject(searchParams?.projectId),
    getCurrentUser()
  ]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Slim top bar (replaces AppShell for the editor) */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 bg-slate-950/80 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-white/5 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <span className="mx-1 h-4 w-px bg-white/10" />
          <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">Video Editor</p>
          {project ? (
            <>
              <span className="mx-1 h-4 w-px bg-white/10" />
              <p className="truncate text-sm font-semibold">{project.title}</p>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {user?.email ? <span className="hidden md:inline">{user.email}</span> : null}
          <Link
            href="/settings"
            className="flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/5 hover:text-white"
          >
            <SettingsIcon className="h-3.5 w-3.5" /> Settings
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="rounded-lg px-2 py-1 hover:bg-white/5 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Editor fills the rest */}
      <div className="flex-1 overflow-hidden">
        <VideoEditorPanel project={project} />
      </div>
    </div>
  );
}
