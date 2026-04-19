import "server-only";

import { ProjectService } from "@/lib/services";
import { requireUser } from "@/lib/auth";

const projectService = new ProjectService();

/**
 * Returns the active project for the signed-in user:
 *   - If `projectId` is given and owned by the user, that project
 *   - Otherwise the user's most recently updated project, if any
 * Always scoped by userId so users can't see each other's work.
 */
export async function getActiveProject(projectId?: string) {
  const user = await requireUser();

  if (projectId) {
    const project = await projectService.getProjectById(projectId, user.id);
    if (project) return project;
  }

  return projectService.getLatestProject(user.id);
}
