import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

/**
 * Poll render-job status. Returns the current row from sf_render_jobs,
 * scoped to the signed-in user via project ownership.
 */
export async function GET(
  _request: Request,
  { params }: { params: { jobId: string } }
) {
  try {
    const user = await requireUser();
    const job = await db.renderJob.findUnique({
      where: { id: params.jobId },
      include: { project: { select: { userId: true, id: true } } }
    });

    if (!job || job.project.userId !== user.id) {
      return NextResponse.json({ error: "Render job not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: job.id,
      projectId: job.projectId,
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      errorMessage: job.errorMessage,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch render job" },
      { status: 500 }
    );
  }
}
