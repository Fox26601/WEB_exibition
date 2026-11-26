import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { LOCALES } from "@/lib/catalog-types";
import { emptySiblingLocales } from "@/lib/admin-translate";
import {
  translateFailMessage,
  translateWithGemini,
} from "@/lib/gemini-translate";

const localeSchema = z.enum(LOCALES);

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  sourceLocale: localeSchema,
  /** Optional hint; server re-filters against `fields` when provided. */
  targetLocales: z.array(localeSchema).optional(),
  /** Current sibling field values — used so filled locales are never requested. */
  fields: z
    .object({
      en: z.string().optional(),
      ru: z.string().optional(),
      uk: z.string().optional(),
      he: z.string().optional(),
    })
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { text, sourceLocale, fields } = parsed.data;
  const current = {
    en: fields?.en ?? "",
    ru: fields?.ru ?? "",
    uk: fields?.uk ?? "",
    he: fields?.he ?? "",
    [sourceLocale]: text,
  };

  const allowed = emptySiblingLocales(current, sourceLocale);
  const requested = parsed.data.targetLocales?.length
    ? parsed.data.targetLocales.filter((locale) => allowed.includes(locale))
    : allowed;

  if (requested.length === 0) {
    return NextResponse.json({ translations: {} });
  }

  const result = await translateWithGemini({
    text: text.trim(),
    sourceLocale,
    targetLocales: requested,
    signal: req.signal,
  });

  if (!result.ok) {
    // Soft HTTP 200 so the admin UI can show a clear message without treating
    // it as a hard form failure; empties stay empty until Gemini succeeds.
    return NextResponse.json({
      translations: {},
      skipped: result.reason,
      error: translateFailMessage(result.reason, result.detail),
    });
  }

  return NextResponse.json({ translations: result.translations });
}
