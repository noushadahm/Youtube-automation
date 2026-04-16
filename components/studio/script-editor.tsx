"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration } from "@/lib/utils";

const rewriteModes = ["make shorter", "make longer", "more emotional", "more suspenseful", "more cinematic"];

interface ScriptEditorProps {
  project: {
    id: string;
    title: string;
    script: string;
    targetDurationSec: number;
  } | null;
}

export function ScriptEditor({ project }: ScriptEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(project?.title ?? "");
  const [script, setScript] = useState(project?.script ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setTitle(project?.title ?? "");
    setScript(project?.script ?? "");
    setMessage(null);
  }, [project?.id, project?.title, project?.script]);

  async function saveDraft() {
    if (!project) {
      setMessage("Create or select a project first.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title,
          script
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to save script");
      }

      setMessage("Draft saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save script");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Manual Script Editor</CardTitle>
        <CardDescription>Write your own script or paste a working draft, then send it into scene planning.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <Input placeholder="Video title" value={title} onChange={(event) => setTitle(event.target.value)} />
          <Input placeholder="Estimated duration" value={project ? formatDuration(project.targetDurationSec) : "00:00"} readOnly />
        </div>
        <Textarea className="mt-4 min-h-[320px]" value={script} onChange={(event) => setScript(event.target.value)} />
        <div className="mt-4 flex flex-wrap gap-2">
          {rewriteModes.map((mode) => (
            <Button key={mode} variant="outline" size="sm" disabled>
              <Wand2 className="mr-2 h-4 w-4" />
              {mode}
            </Button>
          ))}
          <Button size="sm" onClick={saveDraft} disabled={saving}>
            {saving ? "Saving..." : "Save draft"}
          </Button>
          <Button size="sm" variant="outline" disabled>
            Split into scenes
          </Button>
        </div>
        {message ? <p className="mt-3 text-sm text-cyan-200">{message}</p> : null}
      </CardContent>
    </Card>
  );
}
