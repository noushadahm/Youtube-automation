import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

/**
 * Update a music/SFX track's offset, trim, and volume (all stored in
 * metadataJson so we don't mutate the schema for per-track settings).
 *
 * Body: { offsetSec?, trimStartSec?, volume?, label? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: { projectId: string; assetId: string } }
) {
  try {
    const user = await requireUser();
    const asset = await db.asset.findFirst({
      where: {
        id: params.assetId,
        projectId: params.projectId,
        type: "music"
      },
      include: { project: { select: { userId: true } } }
    });
    if (!asset || asset.project.userId !== user.id) {
      return NextResponse.json({ error: "Music asset not found" }, { status: 404 });
    }

    const body = await request.json();
    const existing = (asset.metadataJson as Record<string, unknown> | null) ?? {};
    const patch: Record<string, unknown> = { ...existing };
    if (typeof body.offsetSec === "number" && body.offsetSec >= 0) {
      patch.offsetSec = body.offsetSec;
    }
    if (typeof body.trimStartSec === "number" && body.trimStartSec >= 0) {
      patch.trimStartSec = body.trimStartSec;
    }
    if (typeof body.durationSec === "number" && body.durationSec > 0) {
      patch.durationSec = body.durationSec;
    }
    if (typeof body.volume === "number" && body.volume >= 0 && body.volume <= 1) {
      patch.volume = body.volume;
    }
    if (typeof body.label === "string") {
      patch.label = body.label;
    }

    const updated = await db.asset.update({
      where: { id: asset.id },
      data: { metadataJson: patch as never }
    });

    return NextResponse.json({ asset: updated });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update track" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { projectId: string; assetId: string } }
) {
  try {
    const user = await requireUser();
    const asset = await db.asset.findFirst({
      where: {
        id: params.assetId,
        projectId: params.projectId,
        type: "music"
      },
      include: { project: { select: { userId: true } } }
    });
    if (!asset || asset.project.userId !== user.id) {
      return NextResponse.json({ error: "Music asset not found" }, { status: 404 });
    }
    await db.asset.delete({ where: { id: asset.id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to remove track" },
      { status: 500 }
    );
  }
}
