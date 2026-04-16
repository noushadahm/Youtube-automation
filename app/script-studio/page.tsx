import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { AIChatPanel } from "@/components/studio/ai-chat-panel";
import { SceneCards } from "@/components/studio/scene-cards";
import { ScriptEditor } from "@/components/studio/script-editor";
import { getActiveProject } from "@/lib/project-context";

export default async function ScriptStudioPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Script Studio</p>
        <h2 className="font-display text-5xl">Write, generate, and shape the story.</h2>
      </div>
      <ProjectContextBar project={project} />
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <AIChatPanel project={project} />
        <ScriptEditor project={project} />
      </div>
      <div className="mt-6">
        <SceneCards />
      </div>
    </AppShell>
  );
}
