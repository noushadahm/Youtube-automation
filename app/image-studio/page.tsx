import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { ImageGrid } from "@/components/studio/image-grid";
import { getActiveProject } from "@/lib/project-context";

export default async function ImageStudioPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Image Studio</p>
        <h2 className="font-display text-5xl">Generate and manage scene artwork.</h2>
      </div>
      <ProjectContextBar project={project} />
      <ImageGrid project={project} />
    </AppShell>
  );
}
