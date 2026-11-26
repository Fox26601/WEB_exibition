import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, upsertArtwork } from "@/lib/catalog";
import { emptyLocalized, normalizeArtwork } from "@/lib/catalog-types";
import { randomUUID } from "crypto";

const localizedSchema = z.object({
  en: z.string(),
  ru: z.string(),
  uk: z.string(),
  he: z.string(),
});

const bookletPageSchema = z.object({
  key: z.string(),
  title: localizedSchema,
  body: localizedSchema,
});

const artworkSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["image", "video", "model"]),
  sort: z.number().optional(),
  published: z.boolean().default(false),
  title: localizedSchema.optional(),
  text: localizedSchema.optional(),
  booklet: z.array(bookletPageSchema).optional(),
  urlWall: z.string().default(""),
  urlFull: z.string().default(""),
  urlVideo: z.string().default(""),
  urlPoster: z.string().default(""),
  modelUrl: z.string().optional(),
  frameId: z.enum(["thin", "wood", "metal", "ornate", "none"]).optional(),
  mediaWidth: z.number().positive().optional(),
  mediaHeight: z.number().positive().optional(),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const draft = await loadCatalog("draft");
  return NextResponse.json(draft, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
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
  const artwork = normalizeArtwork(
    {
      id: data.id || randomUUID(),
      type: data.type,
      sort: data.sort ?? 0,
      published: data.published,
      title: data.title || emptyLocalized(),
      text: data.text || emptyLocalized(),
      booklet: data.booklet,
      urlWall: data.urlWall,
      urlFull: data.urlFull,
      urlVideo: data.urlVideo,
      urlPoster: data.urlPoster,
      modelUrl: data.modelUrl || "",
      frameId: data.frameId || (data.type === "model" ? "none" : "wood"),
      mediaWidth: data.mediaWidth,
      mediaHeight: data.mediaHeight,
    },
    { syncTitleTextFromBooklet: true },
  );

  try {
    const catalog = await upsertArtwork(artwork);
    return NextResponse.json({ artwork, catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
