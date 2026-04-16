import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { SceneCards } from "@/components/studio/scene-cards";
import { getActiveProject } from "@/lib/project-context";

export default async function SceneStudioPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Scene Studio</p>
        <h2 className="font-display text-5xl">Tune pacing, narration beats, and visual descriptions.</h2>
      </div>
      <ProjectContextBar project={project} />
      <SceneCards project={project} />
    </AppShell>
  );
}
