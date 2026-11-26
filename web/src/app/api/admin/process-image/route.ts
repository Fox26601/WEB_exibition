import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth";
import { writeBlobBinary } from "@/lib/blob-store";
import { randomUUID } from "crypto";

const RAW_MAX = 8 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  if (file.size > RAW_MAX) {
    return NextResponse.json({ error: "Image exceeds 8MB" }, { status: 413 });
  }

  const input = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();

  const meta = await sharp(input).rotate().metadata();
  const mediaWidth =
    typeof meta.width === "number" && meta.width > 0 ? meta.width : undefined;
  const mediaHeight =
    typeof meta.height === "number" && meta.height > 0 ? meta.height : undefined;

  const wallBuf = await sharp(input)
    .rotate()
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const fullBuf = await sharp(input)
    .rotate()
    .resize(2048, 2048, { fit: "inside", withoutEnlargement: true })
    .webp({ quality: 85 })
    .toBuffer();

  const wall = await writeBlobBinary(
    `artworks/${id}/wall.webp`,
    wallBuf,
    "image/webp",
  );
  const full = await writeBlobBinary(
    `artworks/${id}/full.webp`,
    fullBuf,
    "image/webp",
  );

  if (!wall || !full) {
    return NextResponse.json(
      { error: "Failed to store processed images" },
      { status: 503 },
    );
  }

  return NextResponse.json({
    urlWall: wall.url,
    urlFull: full.url,
    ...(mediaWidth != null ? { mediaWidth } : {}),
    ...(mediaHeight != null ? { mediaHeight } : {}),
  });
}
