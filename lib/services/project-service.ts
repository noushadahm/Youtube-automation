import { NarrationSourceType, StorySourceType } from "@prisma/client";
import { db } from "@/lib/db";
import type { AspectRatio, ProjectStatus, ScenePlan } from "@/types";

interface CreateProjectInput {
  userId: string;
  title: string;
  genre: string;
  language: string;
  targetDurationSec: number;
  aspectRatio: AspectRatio;
  storySourceType: StorySourceType;
}

export class ProjectService {
  async listProjects() {
    return db.project.findMany({
      include: {
        assets: {
          orderBy: {
            createdAt: "desc"
          },
          take: 5
        },
        scenes: {
          orderBy: {
            order: "asc"
          }
        },
        renderJobs: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async getProjectById(projectId: string) {
    return db.project.findUnique({
      where: { id: projectId },
      include: {
        assets: {
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        },
        scenes: {
          orderBy: {
            order: "asc"
          }
        },
        renderJobs: {
          orderBy: {
            createdAt: "desc"
          },
          take: 5
        }
      }
    });
  }

  async getLatestProject() {
    return db.project.findFirst({
      include: {
        assets: {
          orderBy: {
            createdAt: "desc"
          },
          take: 20
        },
        scenes: {
          orderBy: {
            order: "asc"
          }
        },
        renderJobs: {
          orderBy: {
            createdAt: "desc"
          },
          take: 5
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  async createProject(input: CreateProjectInput) {
    return db.project.create({
      data: {
        userId: input.userId,
        title: input.title,
        genre: input.genre,
        language: input.language,
        targetDurationSec: input.targetDurationSec,
        aspectRatio: input.aspectRatio,
        storySourceType: input.storySourceType
      }
    });
  }

  async updateScript(projectId: string, script: string, title?: string) {
    return db.project.update({
      where: { id: projectId },
      data: {
        script,
        ...(title ? { title } : {})
      }
    });
  }

  async setNarrationSource(projectId: string, narrationSourceType: NarrationSourceType) {
    return db.project.update({
      where: { id: projectId },
      data: { narrationSourceType }
    });
  }

  async setStatus(projectId: string, status: ProjectStatus) {
    return db.project.update({
      where: { id: projectId },
      data: { status }
    });
  }

  async replaceScenes(projectId: string, scenes: ScenePlan[]) {
    await db.scene.deleteMany({ where: { projectId } });
    await db.scene.createMany({
      data: scenes.map((scene) => ({
        projectId,
        order: scene.sceneNumber,
        narrationText: scene.narration,
        subtitleText: scene.subtitle,
        visualDescription: scene.visualDescription,
        imagePrompt: scene.imagePrompt,
        durationSec: scene.durationSec
      }))
    });

    return db.scene.findMany({
      where: { projectId },
      orderBy: { order: "asc" }
    });
  }

  async updateSceneImage(sceneId: string, imageUrl: string) {
    return db.scene.update({
      where: { id: sceneId },
      data: {
        imageUrl
      }
    });
  }
}
