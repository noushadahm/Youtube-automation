import type { ProjectWithScenes } from "@/types";

export const demoProject: ProjectWithScenes = {
  id: "demo-project",
  title: "The Lantern in the Fog",
  genre: "mystery",
  language: "English",
  targetDurationSec: 300,
  aspectRatio: "16:9",
  script:
    "At the edge of a forgotten fishing town, a lonely lighthouse keeper finds a lantern that glows only when someone is about to disappear...",
  status: "ready_to_render",
  scenes: [
    {
      sceneNumber: 1,
      narration: "Fog rolled over the harbor before sunrise, swallowing the docks one boat at a time.",
      subtitle: "Fog swallowed the harbor before sunrise.",
      visualDescription: "Wide shot of a misty fishing harbor with sodium lights reflecting on wet wood.",
      imagePrompt:
        "cinematic misty harbor at dawn, abandoned fishing town, glowing sodium lights, wet docks, dramatic fog, moody realism",
      durationSec: 7
    },
    {
      sceneNumber: 2,
      narration: "From the lighthouse window, Elias saw a single lantern shining where no one should have been.",
      subtitle: "A lone lantern shimmered in the fog.",
      visualDescription: "Silhouette of a lighthouse keeper looking toward a floating lantern in dense fog.",
      imagePrompt:
        "silhouette lighthouse keeper at tall window, mysterious floating lantern in dense ocean fog, tense cinematic mood",
      durationSec: 8
    }
  ]
};
