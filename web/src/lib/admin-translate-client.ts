import type { Artwork, BookletPage, CatalogSettings, Locale, LocalizedString } from "./catalog-types";
import {
  mergeOnlyEmptyTranslations,
  planAutoTranslate,
  planFillEmptyLocales,
} from "./admin-translate";

type TranslateResponse = {
  translations?: Partial<Record<Locale, string>>;
};

/**
 * POST /api/admin/translate for one LocalizedString group.
 * Soft-fails (returns current fields) on network/auth/key/abort errors.
 */
export async function requestTranslations(
  fields: LocalizedString,
  sourceLocale: Locale,
  sourceText: string,
  signal?: AbortSignal,
): Promise<Partial<Record<Locale, string>>> {
  const plan = planAutoTranslate(fields, sourceLocale, sourceText);
  if (!plan) return {};
  try {
    const res = await fetch("/api/admin/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        text: plan.text,
        sourceLocale: plan.sourceLocale,
        targetLocales: plan.targetLocales,
        fields,
      }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as TranslateResponse;
    if (!data.translations || typeof data.translations !== "object") return {};
    return data.translations;
  } catch {
    return {};
  }
}

/** Fill empty siblings of a LocalizedString; never overwrites non-empty text. */
export async function fillEmptyLocales(
  fields: LocalizedString,
  signal?: AbortSignal,
): Promise<LocalizedString> {
  const plan = planFillEmptyLocales(fields);
  if (!plan) return fields;
  const translations = await requestTranslations(
    fields,
    plan.sourceLocale,
    plan.text,
    signal,
  );
  return mergeOnlyEmptyTranslations(fields, translations);
}

async function fillBookletPages(
  pages: BookletPage[],
  signal?: AbortSignal,
): Promise<BookletPage[]> {
  return Promise.all(
    pages.map(async (page) => {
      const [title, body] = await Promise.all([
        fillEmptyLocales(page.title, signal),
        fillEmptyLocales(page.body, signal),
      ]);
      return { ...page, title, body };
    }),
  );
}

/** Fill every multi-locale Settings field that still has empty twins. */
export async function fillSettingsLocales(
  settings: CatalogSettings,
  signal?: AbortSignal,
): Promise<CatalogSettings> {
  const [poster, bio, aboutArtist, aboutCurator, donateText, booklet] =
    await Promise.all([
      fillEmptyLocales(settings.poster, signal),
      fillEmptyLocales(settings.bio, signal),
      fillEmptyLocales(settings.aboutArtist, signal),
      fillEmptyLocales(settings.aboutCurator, signal),
      fillEmptyLocales(settings.donate.text, signal),
      fillBookletPages(settings.entrance.booklet, signal),
    ]);
  return {
    ...settings,
    poster,
    bio,
    aboutArtist,
    aboutCurator,
    donate: { ...settings.donate, text: donateText },
    entrance: { ...settings.entrance, booklet },
  };
}

/** Fill artwork title + booklet page title/body empty twins. */
export async function fillArtworkLocales(
  artwork: Artwork,
  signal?: AbortSignal,
): Promise<Artwork> {
  const booklet = Array.isArray(artwork.booklet) ? artwork.booklet : [];
  const [title, text, filledBooklet] = await Promise.all([
    fillEmptyLocales(artwork.title, signal),
    fillEmptyLocales(artwork.text, signal),
    fillBookletPages(booklet, signal),
  ]);
  return {
    ...artwork,
    title,
    text,
    booklet: filledBooklet,
  };
}
