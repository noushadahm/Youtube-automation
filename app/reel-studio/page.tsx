import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { ReelStudioPanel } from "@/components/studio/reel-studio-panel";
import { getActiveProject } from "@/lib/project-context";

export default async function ReelStudioPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Reel Studio</p>
        <h2 className="font-display text-5xl">Create a 30-second reel from the current project.</h2>
      </div>
      <ProjectContextBar project={project} />
      <ReelStudioPanel project={project} />
    </AppShell>
  );
}
