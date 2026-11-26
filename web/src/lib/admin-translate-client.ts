import type { Artwork, BookletPage, CatalogSettings, Locale, LocalizedString } from "./catalog-types";
import {
  mergeOnlyEmptyTranslations,
  planAutoTranslate,
  planFillEmptyLocales,
} from "./admin-translate";

export type TranslateClientResult = {
  translations: Partial<Record<Locale, string>>;
  /** Present when Gemini soft-failed or the HTTP call failed. */
  error?: string;
};

type TranslateResponse = {
  translations?: Partial<Record<Locale, string>>;
  skipped?: string;
  error?: string;
};

/**
 * POST /api/admin/translate for one LocalizedString group.
 * Soft-fails (empty translations + optional error) on network/auth/key/abort.
 */
export async function requestTranslations(
  fields: LocalizedString,
  sourceLocale: Locale,
  sourceText: string,
  signal?: AbortSignal,
): Promise<TranslateClientResult> {
  const plan = planAutoTranslate(fields, sourceLocale, sourceText);
  if (!plan) return { translations: {} };
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
    if (signal?.aborted) return { translations: {} };
    if (res.status === 403) {
      return {
        translations: {},
        error: "Auto-translate unavailable: admin session required.",
      };
    }
    if (!res.ok) {
      return {
        translations: {},
        error: `Auto-translate failed (HTTP ${res.status}).`,
      };
    }
    const data = (await res.json()) as TranslateResponse;
    const translations =
      data.translations && typeof data.translations === "object"
        ? data.translations
        : {};
    if (typeof data.error === "string" && data.error.trim()) {
      return { translations, error: data.error.trim() };
    }
    if (data.skipped) {
      return {
        translations,
        error: `Auto-translate skipped (${data.skipped}).`,
      };
    }
    return { translations };
  } catch (err) {
    if (
      signal?.aborted ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      return { translations: {} };
    }
    return {
      translations: {},
      error: "Auto-translate failed: network error.",
    };
  }
}

/** Fill empty siblings of a LocalizedString; never overwrites non-empty text. */
export async function fillEmptyLocales(
  fields: LocalizedString,
  signal?: AbortSignal,
): Promise<{ fields: LocalizedString; error?: string }> {
  const plan = planFillEmptyLocales(fields);
  if (!plan) return { fields };
  const result = await requestTranslations(
    fields,
    plan.sourceLocale,
    plan.text,
    signal,
  );
  return {
    fields: mergeOnlyEmptyTranslations(fields, result.translations),
    error: result.error,
  };
}

async function fillBookletPages(
  pages: BookletPage[],
  signal?: AbortSignal,
): Promise<{ pages: BookletPage[]; error?: string }> {
  let error: string | undefined;
  const next = await Promise.all(
    pages.map(async (page) => {
      const [title, body] = await Promise.all([
        fillEmptyLocales(page.title, signal),
        fillEmptyLocales(page.body, signal),
      ]);
      error = error ?? title.error ?? body.error;
      return { ...page, title: title.fields, body: body.fields };
    }),
  );
  return { pages: next, error };
}

/** Fill every multi-locale Settings field that still has empty twins. */
export async function fillSettingsLocales(
  settings: CatalogSettings,
  signal?: AbortSignal,
): Promise<{ settings: CatalogSettings; error?: string }> {
  const [poster, bio, aboutArtist, aboutCurator, donateText, booklet] =
    await Promise.all([
      fillEmptyLocales(settings.poster, signal),
      fillEmptyLocales(settings.bio, signal),
      fillEmptyLocales(settings.aboutArtist, signal),
      fillEmptyLocales(settings.aboutCurator, signal),
      fillEmptyLocales(settings.donate.text, signal),
      fillBookletPages(settings.entrance.booklet, signal),
    ]);
  const error =
    poster.error ??
    bio.error ??
    aboutArtist.error ??
    aboutCurator.error ??
    donateText.error ??
    booklet.error;
  return {
    settings: {
      ...settings,
      poster: poster.fields,
      bio: bio.fields,
      aboutArtist: aboutArtist.fields,
      aboutCurator: aboutCurator.fields,
      donate: { ...settings.donate, text: donateText.fields },
      entrance: { ...settings.entrance, booklet: booklet.pages },
    },
    error,
  };
}

/** Fill artwork title + booklet page title/body empty twins. */
export async function fillArtworkLocales(
  artwork: Artwork,
  signal?: AbortSignal,
): Promise<{ artwork: Artwork; error?: string }> {
  const booklet = Array.isArray(artwork.booklet) ? artwork.booklet : [];
  const [title, text, filledBooklet] = await Promise.all([
    fillEmptyLocales(artwork.title, signal),
    fillEmptyLocales(artwork.text, signal),
    fillBookletPages(booklet, signal),
  ]);
  return {
    artwork: {
      ...artwork,
      title: title.fields,
      text: text.fields,
      booklet: filledBooklet.pages,
    },
    error: title.error ?? text.error ?? filledBooklet.error,
  };
}
