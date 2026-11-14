import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, upsertArtwork, deleteArtwork } from "@/lib/catalog";
import { emptyLocalized, type Artwork } from "@/lib/catalog-types";

const localizedSchema = z.object({
  en: z.string(),
  ru: z.string(),
  uk: z.string(),
  he: z.string(),
});

const patchSchema = z.object({
  type: z.enum(["image", "video"]).optional(),
  sort: z.number().optional(),
  published: z.boolean().optional(),
  title: localizedSchema.optional(),
  text: localizedSchema.optional(),
  urlWall: z.string().optional(),
  urlFull: z.string().optional(),
  urlVideo: z.string().optional(),
  urlPoster: z.string().optional(),
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

  const artwork: Artwork = {
    ...existing,
    ...parsed.data,
    id,
    title: parsed.data.title || existing.title || emptyLocalized(),
    text: parsed.data.text || existing.text || emptyLocalized(),
  };

  const catalog = await upsertArtwork(artwork);
  return NextResponse.json({ artwork, catalog });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const catalog = await deleteArtwork(id);
  return NextResponse.json({ catalog });
}
