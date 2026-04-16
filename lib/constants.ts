import { type AspectRatio, type ProjectStatus } from "@/types";

export const APP_NAME = "StoryFlow Studio";

export const sidebarItems = [
  { href: "/", label: "Dashboard" },
  { href: "/projects/new", label: "New Project" },
  { href: "/script-studio", label: "Script Studio" },
  { href: "/voice-studio", label: "Voice Studio" },
  { href: "/scene-studio", label: "Scene Studio" },
  { href: "/image-studio", label: "Image Studio" },
  { href: "/video-editor", label: "Video Editor" },
  { href: "/reel-studio", label: "Reel Studio" },
  { href: "/exports", label: "Exports" },
  { href: "/settings", label: "Settings" }
];

export const projectStatuses: ProjectStatus[] = [
  "draft",
  "generating_script",
  "generating_scenes",
  "generating_images",
  "generating_audio",
  "ready_to_render",
  "rendering",
  "completed",
  "failed"
];

export const aspectRatios: AspectRatio[] = ["9:16", "16:9"];
export const genreOptions = ["horror", "fantasy", "motivation", "kids", "mystery", "realistic", "cinematic"];
export const durationOptions = [
  { label: "1 min", value: 60 },
  { label: "3 min", value: 180 },
  { label: "5 min", value: 300 },
  { label: "10 min", value: 600 }
];
