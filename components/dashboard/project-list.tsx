"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetch("/api/projects");
        const payload = await response.json();
        setProjects(payload.projects ?? []);
      } finally {
        setLoading(false);
      }
    }

    void loadProjects();
  }, []);

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Projects</CardTitle>
          <CardDescription>Your recent video projects and where each one is in the pipeline.</CardDescription>
        </div>
        <Button asChild>
          <Link href="/projects/new">Create project</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? <p className="text-sm text-muted-foreground">Loading projects...</p> : null}
        {!loading && projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No projects yet. Create one to start the studio workflow.</p>
        ) : null}
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/script-studio?projectId=${project.id}`}
            className="block rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:bg-white/[0.06]"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-lg font-semibold">{project.title}</p>
                <p className="text-sm text-muted-foreground">
                  {project.genre} • {project.language} • {formatDuration(project.targetDurationSec)}
                </p>
              </div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">
                {project.status}
              </span>
            </div>
            <p className="mt-4 line-clamp-3 text-sm text-slate-300">
              {project.script || "No script yet. Open this project to start writing or generate with AI."}
            </p>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
