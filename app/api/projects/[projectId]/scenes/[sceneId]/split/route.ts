import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

/**
 * Split a scene at a fractional point into two adjacent scenes.
 * Body: { fraction: number }   // 0 < fraction < 1, default 0.5
 *
 * Both halves inherit narration/image/metadata; the duration is split
 * proportionally. Subsequent scenes have their `order` bumped by 1.
 * The new scene lands directly after the original.
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string; sceneId: string } }
) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const fraction = Math.min(0.9, Math.max(0.1, Number(body.fraction ?? 0.5)));

    const scene = await db.scene.findFirst({
      where: { id: params.sceneId, projectId: params.projectId },
      include: { project: { select: { userId: true } } }
    });
    if (!scene || scene.project.userId !== user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const firstDuration = Math.max(0.5, scene.durationSec * fraction);
    const secondDuration = Math.max(0.5, scene.durationSec - firstDuration);

    const result = await db.$transaction(async (tx) => {
      // Bump all scenes at or after the current order by 1 (makes room for the new scene).
      await tx.scene.updateMany({
        where: { projectId: params.projectId, order: { gt: scene.order } },
        data: { order: { increment: 1 } }
      });

      // Shrink the original.
      const updated = await tx.scene.update({
        where: { id: scene.id },
        data: { durationSec: firstDuration }
      });

      // Create the tail.
      const created = await tx.scene.create({
        data: {
          projectId: params.projectId,
          order: scene.order + 1,
          narrationText: scene.narrationText,
          subtitleText: scene.subtitleText,
          visualDescription: scene.visualDescription,
          imagePrompt: scene.imagePrompt,
          durationSec: secondDuration,
          cameraMotion: scene.cameraMotion,
          transition: scene.transition
        }
      });

      return { updated, created };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to split scene" },
      { status: 500 }
    );
  }
}
