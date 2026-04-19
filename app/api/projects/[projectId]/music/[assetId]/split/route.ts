import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";

/**
 * Split a music/SFX track in two at a given absolute timeline time.
 *
 * Body: { atSec: number }   — absolute time on the project timeline where
 *                             the cut should land
 *
 * Both halves reference the same underlying audio file; only offset + trim
 * + duration metadata change, so no re-encoding happens and splits are
 * instant. After a split, each half can be trimmed, moved, or deleted on its
 * own, which is how CapCut / Premiere handle audio cuts.
 */
export async function POST(
  request: Request,
  { params }: { params: { projectId: string; assetId: string } }
) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const atSec = Number(body.atSec);
    if (!Number.isFinite(atSec) || atSec <= 0) {
      return NextResponse.json({ error: "atSec must be a positive number" }, { status: 400 });
    }

    const asset = await db.asset.findFirst({
      where: {
        id: params.assetId,
        projectId: params.projectId,
        type: "music"
      },
      include: { project: { select: { userId: true } } }
    });
    if (!asset || asset.project.userId !== user.id) {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    const meta = (asset.metadataJson as Record<string, unknown> | null) ?? {};
    const offsetSec = typeof meta.offsetSec === "number" ? (meta.offsetSec as number) : 0;
    const trimStartSec =
      typeof meta.trimStartSec === "number" ? (meta.trimStartSec as number) : 0;
    const originalDuration =
      typeof meta.durationSec === "number" ? (meta.durationSec as number) : null;
    const volume = typeof meta.volume === "number" ? (meta.volume as number) : 0.25;
    const label = typeof meta.label === "string" ? (meta.label as string) : "Music";

    // Compute position relative to the track's own playback timeline.
    const relSplit = atSec - offsetSec;
    const effectiveDuration =
      originalDuration ?? Math.max(relSplit + 1, 1); // assume infinite unless overridden
    if (relSplit <= 0.1 || relSplit >= effectiveDuration - 0.1) {
      return NextResponse.json(
        {
          error:
            "Split point is outside this track's play range. Move the playhead somewhere over the clip."
        },
        { status: 400 }
      );
    }

    // Part A (head): same file, same trimStart, shortened duration.
    // Part B (tail): same file, bumped trimStart + bumped offset, remaining duration.
    const headDuration = relSplit;
    const tailDuration = effectiveDuration - relSplit;
    const tailOffsetSec = offsetSec + relSplit;
    const tailTrimStartSec = trimStartSec + relSplit;

    const result = await db.$transaction(async (tx) => {
      const head = await tx.asset.update({
        where: { id: asset.id },
        data: {
          metadataJson: {
            ...meta,
            durationSec: headDuration,
            label: `${label} (A)`
          }
        }
      });

      const tail = await tx.asset.create({
        data: {
          projectId: params.projectId,
          type: "music",
          provider: asset.provider,
          localPath: asset.localPath,
          url: asset.url,
          metadataJson: {
            ...meta,
            offsetSec: tailOffsetSec,
            trimStartSec: tailTrimStartSec,
            durationSec: tailDuration,
            volume,
            label: `${label} (B)`,
            splitFrom: asset.id
          }
        }
      });

      return { headId: head.id, tailId: tail.id };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    console.error("[music-split] failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to split track" },
      { status: 500 }
    );
  }
}
