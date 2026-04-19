import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

const CAMERA_MOTIONS = new Set([
  "none",
  "zoomIn",
  "zoomOut",
  "panLeft",
  "panRight",
  "panUp",
  "panDown"
]);
const TRANSITIONS = new Set(["cut", "fade", "dissolve"]);

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; sceneId: string } }
) {
  try {
    const user = await requireUser();
    const existing = await db.scene.findFirst({
      where: { id: params.sceneId, projectId: params.projectId },
      include: { project: { select: { userId: true } } }
    });
    if (!existing || existing.project.userId !== user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    // Delete in a transaction: drop the scene + compact remaining orders.
    await db.$transaction(async (tx) => {
      await tx.scene.delete({ where: { id: params.sceneId } });
      const remaining = await tx.scene.findMany({
        where: { projectId: params.projectId },
        orderBy: { order: "asc" }
      });
      // Re-number so `order` is contiguous starting at 1.
      for (let i = 0; i < remaining.length; i += 1) {
        if (remaining[i].order !== i + 1) {
          await tx.scene.update({
            where: { id: remaining[i].id },
            data: { order: i + 1 }
          });
        }
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete scene" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string; sceneId: string } }
) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const existingScene = await db.scene.findFirst({
      where: { id: params.sceneId, projectId: params.projectId },
      include: { project: { select: { userId: true } } }
    });

    if (!existingScene || existingScene.project.userId !== user.id) {
      return NextResponse.json({ error: "Scene not found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {};
    if (typeof body.durationSec === "number") updates.durationSec = body.durationSec;
    if (typeof body.cameraMotion === "string" && CAMERA_MOTIONS.has(body.cameraMotion)) {
      updates.cameraMotion = body.cameraMotion;
    }
    if (typeof body.transition === "string" && TRANSITIONS.has(body.transition)) {
      updates.transition = body.transition;
    }
    if (typeof body.narrationText === "string") updates.narrationText = body.narrationText;
    if (typeof body.subtitleText === "string") updates.subtitleText = body.subtitleText;
    if (typeof body.imagePrompt === "string") updates.imagePrompt = body.imagePrompt;

    // Reorder via swap: if a new order index is given, move the scene there
    // and shift others accordingly. Kept in a transaction for consistency.
    if (typeof body.order === "number" && body.order > 0) {
      const desired = Math.round(body.order);
      const scenes = await db.scene.findMany({
        where: { projectId: params.projectId },
        orderBy: { order: "asc" }
      });
      const current = scenes.find((s) => s.id === params.sceneId);
      if (current && desired !== current.order && desired <= scenes.length) {
        const reordered = scenes.filter((s) => s.id !== current.id);
        reordered.splice(desired - 1, 0, current);
        await db.$transaction(
          reordered.map((s, i) =>
            db.scene.update({ where: { id: s.id }, data: { order: i + 1 } })
          )
        );
      }
    }

    const scene = Object.keys(updates).length
      ? await db.scene.update({ where: { id: params.sceneId }, data: updates })
      : await db.scene.findUniqueOrThrow({ where: { id: params.sceneId } });

    return NextResponse.json({ scene });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update scene" },
      { status: 500 }
    );
  }
}
