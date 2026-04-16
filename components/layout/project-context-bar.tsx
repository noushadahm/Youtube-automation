import Link from "next/link";
import { ArrowRight, Clock3, FolderKanban, Languages, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";

interface ProjectContextBarProps {
  project: {
    id: string;
    title: string;
    genre: string;
    language: string;
    targetDurationSec: number;
    status: string;
    script: string;
    scenes: Array<unknown>;
  } | null;
}

export function ProjectContextBar({ project }: ProjectContextBarProps) {
  if (!project) {
    return (
      <div className="glass-panel mb-6 rounded-3xl p-5">
        <p className="text-sm text-muted-foreground">No active project selected yet.</p>
        <Button asChild className="mt-4">
          <Link href="/projects/new">Create your first project</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="glass-panel mb-6 rounded-3xl p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
              Active project
            </span>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
              {project.status}
            </span>
          </div>
          <div>
            <h3 className="font-display text-4xl leading-none">{project.title}</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-300">
              {project.script || "This project is ready for script writing, AI generation, scenes, voice, and rendering."}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Genre
            </div>
            <p className="font-semibold capitalize">{project.genre}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Languages className="h-4 w-4" />
              Language
            </div>
            <p className="font-semibold">{project.language}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm">
            <div className="mb-1 flex items-center gap-2 text-muted-foreground">
              <Clock3 className="h-4 w-4" />
              Target length
            </div>
            <p className="font-semibold">{formatDuration(project.targetDurationSec)}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <FolderKanban className="h-4 w-4" />
          Project ID: {project.id}
        </span>
        <span className="inline-flex items-center gap-2">
          <ArrowRight className="h-4 w-4" />
          Scenes: {project.scenes.length}
        </span>
      </div>
    </div>
  );
}
