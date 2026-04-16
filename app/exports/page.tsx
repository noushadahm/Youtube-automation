import { Download, FileText, Film } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectContextBar } from "@/components/layout/project-context-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getActiveProject } from "@/lib/project-context";

export default async function ExportsPage({
  searchParams
}: {
  searchParams?: { projectId?: string };
}) {
  const project = await getActiveProject(searchParams?.projectId);

  return (
    <AppShell>
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300/80">Exports</p>
        <h2 className="font-display text-5xl">Download renders and subtitle packages.</h2>
      </div>
      <ProjectContextBar project={project} />
      <Card>
        <CardHeader>
          <CardTitle>Completed Renders</CardTitle>
          <CardDescription>Final MP4 files, subtitle exports, and render metadata.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="font-semibold">The Lantern in the Fog</p>
              <p className="text-sm text-muted-foreground">1920x1080 • rendered with subtitles and narration</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Film className="mr-2 h-4 w-4" />
                MP4
              </Button>
              <Button variant="outline">
                <FileText className="mr-2 h-4 w-4" />
                SRT
              </Button>
              <Button>
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
