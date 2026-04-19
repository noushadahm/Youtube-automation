import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUser, UnauthorizedError } from "@/lib/auth";
import { getSignedUrl, isStoragePath } from "@/lib/storage";

function getContentType(filePath: string | null) {
  if (!filePath) return "application/octet-stream";
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") return "audio/mpeg";
  if (extension === ".wav") return "audio/wav";
  if (extension === ".webm") return "audio/webm";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".mp4") return "video/mp4";
  if (extension === ".srt") return "application/x-subrip";
  return "application/octet-stream";
}

export async function GET(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  try {
    const user = await requireUser();
    const asset = await db.asset.findUnique({
      where: { id: params.assetId },
      include: { project: true }
    });

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    if (asset.project.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";

    // 1) If a local copy still exists, stream it (fast path on dev).
    if (asset.localPath) {
      try {
        const fileBuffer = await fs.readFile(asset.localPath);
        return new NextResponse(fileBuffer, {
          headers: {
            "Content-Type": getContentType(asset.localPath),
            "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${path.basename(
              asset.localPath
            )}"`
          }
        });
      } catch {
        // Fall through to storage.
      }
    }

    // 2) Otherwise, the `url` column holds a Supabase Storage object path.
    if (asset.url && isStoragePath(asset.url)) {
      const signed = await getSignedUrl(asset.url, 60 * 60);
      return NextResponse.redirect(signed, { status: 302 });
    }

    return NextResponse.json({ error: "Asset file not available" }, { status: 404 });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load asset" },
      { status: 500 }
    );
  }
}
