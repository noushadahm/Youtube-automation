import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function getContentType(filePath: string | null) {
  if (!filePath) {
    return "application/octet-stream";
  }

  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".mp3") {
    return "audio/mpeg";
  }
  if (extension === ".wav") {
    return "audio/wav";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".mp4") {
    return "video/mp4";
  }
  if (extension === ".srt") {
    return "application/x-subrip";
  }

  return "application/octet-stream";
}

export async function GET(
  request: Request,
  { params }: { params: { assetId: string } }
) {
  try {
    const asset = await db.asset.findUnique({
      where: {
        id: params.assetId
      }
    });

    if (!asset?.localPath) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    const fileBuffer = await fs.readFile(asset.localPath);
    const url = new URL(request.url);
    const shouldDownload = url.searchParams.get("download") === "1";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": getContentType(asset.localPath),
        "Content-Disposition": `${shouldDownload ? "attachment" : "inline"}; filename="${path.basename(asset.localPath)}"`
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load asset" },
      { status: 500 }
    );
  }
}
