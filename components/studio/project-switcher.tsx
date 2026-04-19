"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ChevronDown, Plus, Rocket } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Project {
  id: string;
  title: string;
  updatedAt: string;
  status: string;
}

/**
 * Quick project-switcher pill used in the video editor top bar.
 * Fetches the user's projects on first open. Clicking a project navigates
 * to that project's editor; a "New project" link and an "Auto-Pilot" link
 * are pinned at the top of the list for fast kickoff.
 */
export function ProjectSwitcher({
  currentProjectId,
  currentTitle
}: {
  currentProjectId: string | null;
  currentTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  async function loadProjects() {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (res.ok) {
        const payload = (await res.json()) as { projects: Project[] };
        setProjects(payload.projects ?? []);
      }
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      if (next && projects.length === 0) void loadProjects();
      return next;
    });
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={toggle}
        className="flex max-w-[360px] items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-left text-sm hover:bg-white/10"
      >
        <span className="truncate font-semibold">{currentTitle}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-30 mt-1 w-80 overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl">
          <div className="border-b border-white/10 bg-white/5 p-1">
            <Link
              href="/auto-pilot"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-white/10"
            >
              <Rocket className="h-3.5 w-3.5 text-cyan-300" />
              Auto-Pilot (prompt → video)
            </Link>
            <Link
              href="/projects/new"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs hover:bg-white/10"
            >
              <Plus className="h-3.5 w-3.5 text-emerald-300" />
              New blank project
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {loading ? (
              <p className="p-3 text-xs text-muted-foreground">Loading projects…</p>
            ) : projects.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">
                No other projects.
              </p>
            ) : (
              projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/video-editor?projectId=${p.id}`}
                  onClick={() => setOpen(false)}
                  className={`block rounded-lg px-3 py-2 text-xs hover:bg-white/10 ${
                    p.id === currentProjectId ? "bg-white/5" : ""
                  }`}
                >
                  <p className="truncate font-medium">
                    {p.title}
                    {p.id === currentProjectId ? (
                      <span className="ml-1 text-[10px] text-cyan-300">
                        (current)
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {p.status} · updated{" "}
                    {formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
