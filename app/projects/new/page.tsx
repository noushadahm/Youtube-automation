import { AppShell } from "@/components/layout/app-shell";
import { NewProjectForm } from "@/components/forms/new-project-form";

export default function NewProjectPage() {
  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">New Project</p>
        <h2 className="font-display text-5xl">Kick off a new story pipeline.</h2>
      </div>
      <NewProjectForm />
    </AppShell>
  );
}
