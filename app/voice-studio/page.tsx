import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { VoiceStudioPanel } from "@/components/studio/voice-studio-panel";
import { getActiveProject } from "@/lib/project-context";

export default async function VoiceStudioPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Voice Studio</p>
        <h2 className="font-display text-5xl">Choose or capture the narration source.</h2>
      </div>
      <ProjectContextBar project={project} />
      <VoiceStudioPanel project={project} />
    </AppShell>
  );
}
