import "server-only";

import { ProjectService } from "@/lib/services";

const projectService = new ProjectService();

export async function getActiveProject(projectId?: string) {
  if (projectId) {
    const project = await projectService.getProjectById(projectId);
    if (project) {
      return project;
    }
  }

  return projectService.getLatestProject();
}
