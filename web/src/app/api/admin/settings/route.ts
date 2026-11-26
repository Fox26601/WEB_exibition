import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, updateSettings } from "@/lib/catalog";

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

const settingsSchema = z.object({
  poster: localizedSchema,
  instagram: z.string(),
  email: z.string(),
  bio: localizedSchema,
  entrance: z.object({
    posterUrl: z.string(),
    booklet: z.array(bookletPageSchema),
  }),
  aboutArtist: localizedSchema,
  aboutCurator: localizedSchema,
  donate: z.object({
    text: localizedSchema,
    url: z.string(),
  }),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const draft = await loadCatalog("draft");
  return NextResponse.json(draft.settings, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const catalog = await updateSettings(parsed.data);
    return NextResponse.json({ settings: catalog.settings, catalog });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Settings save failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
