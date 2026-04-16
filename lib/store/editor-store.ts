import { create } from "zustand";
import type { AspectRatio, TransitionType } from "@/types";

interface EditorStore {
  aspectRatio: AspectRatio;
  subtitleEnabled: boolean;
  activeTransition: TransitionType;
  narrationVolume: number;
  musicVolume: number;
  setAspectRatio: (value: AspectRatio) => void;
  setSubtitleEnabled: (value: boolean) => void;
  setActiveTransition: (value: TransitionType) => void;
  setNarrationVolume: (value: number) => void;
  setMusicVolume: (value: number) => void;
}

export const useEditorStore = create<EditorStore>((set) => ({
  aspectRatio: "16:9",
  subtitleEnabled: true,
  activeTransition: "fade",
  narrationVolume: 85,
  musicVolume: 20,
  setAspectRatio: (value) => set({ aspectRatio: value }),
  setSubtitleEnabled: (value) => set({ subtitleEnabled: value }),
  setActiveTransition: (value) => set({ activeTransition: value }),
  setNarrationVolume: (value) => set({ narrationVolume: value }),
  setMusicVolume: (value) => set({ musicVolume: value })
}));
