"use client";

import { type ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Upload } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface VoiceStudioPanelProps {
  project: {
    assets?: Array<{
      id: string;
      type: string;
      provider: string | null;
      createdAt: string | Date;
    }>;
    id: string;
    title: string;
    script: string;
    narrationSourceType: string;
  } | null;
}

export function VoiceStudioPanel({ project }: VoiceStudioPanelProps) {
  const router = useRouter();
  const [voiceNote, setVoiceNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSupported] = useState(typeof window !== "undefined" && "MediaRecorder" in window);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const latestAudioAsset = project?.assets?.find((asset) => asset.type === "audio");

  async function handleGenerateNarration() {
    if (!project) {
      setMessage("Create or open a project first.");
      return;
    }

    if (!project.script.trim()) {
      setMessage("Generate or write the script first. Voice generation uses the current project script.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/voice/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          projectId: project.id,
          text: project.script,
          note: voiceNote
        })
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Voice generation failed");
      }

      setMessage(`Narration generated for ${project.title}. Saved to ${payload.localPath}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Voice generation failed");
    } finally {
      setLoading(false);
    }
  }

  async function uploadAudio(file: File, sourceType: "uploaded" | "recorded") {
    if (!project) {
      setMessage("Create or open a project first.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("projectId", project.id);
      formData.append("sourceType", sourceType);
      formData.append("file", file);

      const response = await fetch("/api/voice/upload", {
        method: "POST",
        body: formData
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Audio upload failed");
      }

      setMessage(sourceType === "recorded" ? "Recorded narration uploaded." : "Uploaded narration saved.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Audio upload failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    await uploadAudio(file, "uploaded");
    event.target.value = "";
  }

  async function handleRecordingToggle() {
    if (!recordingSupported) {
      setMessage("MediaRecorder is not supported in this browser.");
      return;
    }

    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "recorded-narration.webm", { type: "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        await uploadAudio(file, "recorded");
      };

      recorder.start();
      setMessage("Recording in progress...");
      setIsRecording(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not access microphone");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>ElevenLabs Voice</CardTitle>
          <CardDescription>Generate AI narration using secure server-side ElevenLabs integration.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input placeholder="Voice sample or note" value={voiceNote} onChange={(event) => setVoiceNote(event.target.value)} />
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-muted-foreground">
            {latestAudioAsset ? (
              <div className="space-y-3">
                <p className="text-center text-emerald-300">Narration audio is available for this project.</p>
                <audio className="w-full" controls src={`/api/assets/${latestAudioAsset.id}`}>
                  Your browser does not support audio playback.
                </audio>
                <a
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-transparent text-sm font-semibold hover:bg-white/5"
                  href={`/api/assets/${latestAudioAsset.id}?download=1`}
                >
                  Download audio
                </a>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/api/assets/${latestAudioAsset.id}`} target="_blank">
                    Open audio in browser
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-center">
                {project?.narrationSourceType === "ai_generated"
                  ? "Narration was marked active, but no audio asset was found yet."
                  : "No generated narration yet. Create one to preview it here."}
              </p>
            )}
          </div>
          <Button className="w-full" onClick={handleGenerateNarration} disabled={loading}>
            {loading ? "Generating narration..." : "Generate narration"}
          </Button>
          {message ? <p className="text-sm text-cyan-200">{message}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Upload Voice</CardTitle>
          <CardDescription>Use your own recorded narration as the active source for rendering.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 p-8 text-sm text-muted-foreground">
            <Upload className="mb-3 h-5 w-5" />
            Upload MP3 or WAV
            <input className="hidden" type="file" accept="audio/*" onChange={handleFileUpload} />
          </label>
          <p className="text-sm text-muted-foreground">Uploaded files are automatically set as the active narration source.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Record in Browser</CardTitle>
          <CardDescription>Capture voice directly with MediaRecorder and store it as a project asset.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-8 text-center text-sm text-muted-foreground">
            {isRecording
              ? "Recording... click stop when you are done."
              : recordingSupported
                ? "Click below to start recording with your microphone."
                : "MediaRecorder is not available in this browser."}
          </div>
          <Button className="w-full" onClick={handleRecordingToggle} disabled={!recordingSupported || loading}>
            <Mic className="mr-2 h-4 w-4" />
            {isRecording ? "Stop recording" : "Start recording"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
