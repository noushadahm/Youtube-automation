import type { AspectRatio, TransitionType } from "@/types";

export function getResolution(aspectRatio: AspectRatio) {
  return aspectRatio === "9:16"
    ? { width: 1080, height: 1920 }
    : { width: 1920, height: 1080 };
}

export function buildKenBurnsFilter(durationSec: number, aspectRatio: AspectRatio) {
  const { width, height } = getResolution(aspectRatio);
  return `scale=${width}:${height},zoompan=z='min(zoom+0.0008,1.12)':d=${Math.round(
    durationSec * 25
  )}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=${width}x${height}`;
}

export function buildTransitionFilter(type: TransitionType, offset: number, duration = 0.6) {
  const normalized = type === "none" ? "fade" : type;
  return `xfade=transition=${normalized}:duration=${duration}:offset=${offset}`;
}

export function subtitleStyleFilter() {
  return "FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,BackColour=&H66000000,BorderStyle=4,Alignment=2,MarginV=60";
}
