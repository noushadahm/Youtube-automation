"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatDuration } from "@/lib/utils";

interface ProjectItem {
  id: string;
  title: string;
  genre: string;
  language: string;
  targetDurationSec: number;
  status: string;
  script: string;
}

export function ProjectList() {
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ProjectItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function loadProjects() {
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = await response.json();
      setProjects(payload.projects ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/projects/${pendingDelete.id}/delete`, {
        method: "DELETE"
      });
      if (!res.ok) {
        const p = await res.json().catch(() => ({}));
        throw new Error(p.error ?? "Delete failed");
      }
      setProjects((list) => list.filter((p) => p.id !== pendingDelete.id));
      setPendingDelete(null);
      void loadProjects();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <Card className="h-full">
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Your recent video projects and where each one is in the pipeline.
            </CardDescription>
          </div>
          <Button asChild>
            <Link href="/projects/new">Create project</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading projects...</p>
          ) : null}
          {!loading && projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No projects yet. Create one to start the studio workflow.
            </p>
          ) : null}
          {projects.map((project) => (
            <div
              key={project.id}
              className="group relative rounded-2xl border border-white/10 bg-white/[0.03] transition hover:bg-white/[0.06]"
            >
              <Link
                href={`/script-studio?projectId=${project.id}`}
                className="block p-4"
              >
                <div className="flex items-start justify-between gap-4 pr-10">
                  <div>
                    <p className="text-lg font-semibold">{project.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {project.genre} • {project.language} •{" "}
                      {formatDuration(project.targetDurationSec)}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                    {project.status}
                  </span>
                </div>
                <p className="mt-4 line-clamp-3 text-sm text-slate-300">
                  {project.script ||
                    "No script yet. Open this project to start writing or generate with AI."}
                </p>
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPendingDelete(project);
                }}
                disabled={deletingId === project.id}
                title="Delete project"
                className="absolute right-3 top-3 hidden h-8 w-8 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/30 hover:text-white group-hover:flex"
              >
                {deletingId === project.id ? (
                  <span className="text-[10px]">…</span>
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        variant="destructive"
        title={pendingDelete ? `Delete "${pendingDelete.title}"?` : "Delete project?"}
        description="This permanently removes the project and everything generated for it."
        bullets={[
          "All scenes, narration, music and SFX",
          "All generated + uploaded images and covers",
          "All rendered videos and shorts",
          "All files from Supabase Storage"
        ]}
        danger={deleteError ?? "This cannot be undone."}
        confirmLabel="Delete project"
        busy={deletingId !== null}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (deletingId) return;
          setPendingDelete(null);
          setDeleteError(null);
        }}
      />
    </>
  );
}
