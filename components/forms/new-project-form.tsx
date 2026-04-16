"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { durationOptions, genreOptions } from "@/lib/constants";

export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(formData: FormData) {
    setLoading(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          title: formData.get("title"),
          storySourceType: formData.get("storySourceType"),
          targetDurationSec: Number(formData.get("targetDurationSec")),
          genre: formData.get("genre"),
          language: formData.get("language"),
          aspectRatio: "16:9"
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create project");
      }

      const payload = await response.json();
      router.push(`/script-studio?projectId=${payload.project.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-3xl">
      <CardHeader>
        <CardTitle>Create a new story project</CardTitle>
        <CardDescription>Start from manual writing or let the AI assistant draft the story structure.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={onSubmit} className="grid gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="title">Project title</Label>
            <Input id="title" name="title" placeholder="The Lantern in the Fog" required />
          </div>
          <div className="space-y-2">
            <Label>Script source</Label>
            <Select defaultValue="manual" name="storySourceType">
              <SelectTrigger>
                <SelectValue placeholder="Choose source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">Write script manually</SelectItem>
                <SelectItem value="ai_chat">Generate with AI chat</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Target duration</Label>
            <Select defaultValue="300" name="targetDurationSec">
              <SelectTrigger>
                <SelectValue placeholder="Choose duration" />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map((option) => (
                  <SelectItem key={option.value} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Genre / style</Label>
            <Select defaultValue="mystery" name="genre">
              <SelectTrigger>
                <SelectValue placeholder="Choose genre" />
              </SelectTrigger>
              <SelectContent>
                {genreOptions.map((genre) => (
                  <SelectItem key={genre} value={genre}>
                    {genre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language">Language</Label>
            <Input id="language" name="language" defaultValue="English" />
          </div>
          <div className="md:col-span-2">
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? "Creating..." : "Create project"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
