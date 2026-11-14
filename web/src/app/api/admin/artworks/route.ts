import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, upsertArtwork, deleteArtwork } from "@/lib/catalog";
import { emptyLocalized, type Artwork } from "@/lib/catalog-types";
import { randomUUID } from "crypto";

const localizedSchema = z.object({
  en: z.string(),
  ru: z.string(),
  uk: z.string(),
  he: z.string(),
});

const artworkSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["image", "video"]),
  sort: z.number().optional(),
  published: z.boolean().default(false),
  title: localizedSchema.optional(),
  text: localizedSchema.optional(),
  urlWall: z.string().default(""),
  urlFull: z.string().default(""),
  urlVideo: z.string().default(""),
  urlPoster: z.string().default(""),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const draft = await loadCatalog("draft");
  return NextResponse.json(draft);
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = artworkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const artwork: Artwork = {
    id: data.id || randomUUID(),
    type: data.type,
    sort: data.sort ?? 0,
    published: data.published,
    title: data.title || emptyLocalized(),
    text: data.text || emptyLocalized(),
    urlWall: data.urlWall,
    urlFull: data.urlFull,
    urlVideo: data.urlVideo,
    urlPoster: data.urlPoster,
  };

  const catalog = await upsertArtwork(artwork);
  return NextResponse.json({ artwork, catalog });
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const catalog = await deleteArtwork(id);
  return NextResponse.json({ catalog });
}
