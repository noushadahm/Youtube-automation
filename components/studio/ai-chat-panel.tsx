"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface AIChatPanelProps {
  project: {
    id: string;
    genre: string;
    language: string;
    targetDurationSec: number;
    title: string;
  } | null;
}

export function AIChatPanel({ project }: AIChatPanelProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [rewriteGoal, setRewriteGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!project) {
      setError("Create or open a project first.");
      return;
    }

    if (!prompt.trim()) {
      setError("Enter a story prompt before generating.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const scriptResponse = await fetch("/api/scripts/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          prompt: rewriteGoal ? `${prompt}\n\nAdditional instruction: ${rewriteGoal}` : prompt,
          genre: project.genre,
          language: project.language,
          targetDurationSec: project.targetDurationSec
        })
      });

      const scriptPayload = await scriptResponse.json();

      if (!scriptResponse.ok) {
        throw new Error(scriptPayload.error ?? "Script generation failed");
      }

      const updateResponse = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: scriptPayload.title || project.title,
          script: scriptPayload.story
        })
      });

      const updatePayload = await updateResponse.json();

      if (!updateResponse.ok) {
        throw new Error(updatePayload.error ?? "Failed to save generated script");
      }

      router.refresh();
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>AI Script Chat</CardTitle>
        <CardDescription>
          Describe your video topic and angle. For current events, news, or
          trending subjects, the AI will search the web for fresh information
          before writing.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          placeholder={`Describe your ${project?.genre ?? "video"}: topic, angle, audience, and hook. Example:
• "3-minute explainer on why the dollar is weakening, for retail investors"
• "60s Shorts on the latest Israel-Iran escalation, news-anchor tone"
• "5-minute horror story in a disused subway station, slow-burn"`}
          rows={5}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
        />
        <div className="mt-4 flex gap-3">
          <Input
            placeholder="Optional rewrite goal or follow-up instruction"
            value={rewriteGoal}
            onChange={(event) => setRewriteGoal(event.target.value)}
          />
          <Button onClick={handleGenerate} disabled={loading}>
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "Generating..." : "Generate"}
          </Button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-300">{error}</p> : null}
        {loading ? (
          <p className="mt-3 text-sm text-cyan-200">
            Generating script for {project?.title ?? "your project"}...
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
