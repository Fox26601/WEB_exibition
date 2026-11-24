import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, upsertArtwork, deleteArtwork } from "@/lib/catalog";
import {
  emptyLocalized,
  normalizeArtwork,
  type Artwork,
} from "@/lib/catalog-types";

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

const patchSchema = z.object({
  type: z.enum(["image", "video", "model"]).optional(),
  sort: z.number().optional(),
  published: z.boolean().optional(),
  title: localizedSchema.optional(),
  text: localizedSchema.optional(),
  booklet: z.array(bookletPageSchema).optional(),
  urlWall: z.string().optional(),
  urlFull: z.string().optional(),
  urlVideo: z.string().optional(),
  urlPoster: z.string().optional(),
  modelUrl: z.string().optional(),
  frameId: z.enum(["thin", "wood", "metal", "ornate", "none"]).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const draft = await loadCatalog("draft");
  const artwork = draft.artworks.find((a) => a.id === id);
  if (!artwork) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(artwork);
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const draft = await loadCatalog("draft");
  const existing = draft.artworks.find((a) => a.id === id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const artwork = normalizeArtwork(
    {
      ...existing,
      ...parsed.data,
      id,
      title: parsed.data.title || existing.title || emptyLocalized(),
      text: parsed.data.text || existing.text || emptyLocalized(),
      booklet: parsed.data.booklet ?? existing.booklet,
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

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    const catalog = await deleteArtwork(id);
    return NextResponse.json({ catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
