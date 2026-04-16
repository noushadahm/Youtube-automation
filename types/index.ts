export type StorySourceType = "manual" | "ai_chat";
export type NarrationSourceType = "ai_generated" | "uploaded" | "recorded";
export type ProjectStatus =
  | "draft"
  | "generating_script"
  | "generating_scenes"
  | "generating_images"
  | "generating_audio"
  | "ready_to_render"
  | "rendering"
  | "completed"
  | "failed";

export type AspectRatio = "9:16" | "16:9";
export type TransitionType = "fade" | "crosszoom" | "slide" | "none";

export interface ScenePlan {
  sceneNumber: number;
  narration: string;
  subtitle: string;
  visualDescription: string;
  imagePrompt: string;
  durationSec: number;
}

export interface StoryPlan {
  title: string;
  story: string;
  totalEstimatedDuration: number;
  scenes: ScenePlan[];
}

export interface SubtitleChunk {
  index: number;
  startSec: number;
  endSec: number;
  text: string;
}

export interface ProjectSettings {
  defaultVoiceId?: string;
  defaultElevenLabsModel?: string;
  defaultAspectRatio?: AspectRatio;
  defaultSubtitleStyle?: string;
}

export interface ProjectWithScenes {
  id: string;
  title: string;
  genre: string;
  language: string;
  targetDurationSec: number;
  aspectRatio: AspectRatio;
  script: string;
  status: ProjectStatus;
  scenes: ScenePlan[];
}
