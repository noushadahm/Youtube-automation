import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { VideoEditorPanel } from "@/components/studio/video-editor-panel";
import { getActiveProject } from "@/lib/project-context";

export default async function VideoEditorPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Video Editor</p>
        <h2 className="font-display text-5xl">Preview the cut and prepare the final render.</h2>
      </div>
      <ProjectContextBar project={project} />
      <VideoEditorPanel project={project} />
    </AppShell>
  );
}
