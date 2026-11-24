import { LOCALES, type Locale, type LocalizedString } from "./catalog-types";

export const TRANSLATE_LOCALES = LOCALES;
export type TranslateLocale = Locale;

/** True when a field has no meaningful content (whitespace-only counts as empty). */
export function isEmptyLocalizedValue(value: string | null | undefined): boolean {
  return !String(value ?? "").trim();
}

/**
 * Locales that should receive an auto-translation from `sourceLocale`.
 * Never includes the source; never includes non-empty siblings.
 */
export function emptySiblingLocales(
  fields: LocalizedString,
  sourceLocale: Locale,
): Locale[] {
  return LOCALES.filter(
    (locale) =>
      locale !== sourceLocale && isEmptyLocalizedValue(fields[locale]),
  );
}

/**
 * Merge API translations into current fields.
 * Only empty targets are filled — non-empty text is never overwritten.
 */
export function mergeOnlyEmptyTranslations(
  current: LocalizedString,
  translations: Partial<Record<Locale, string>>,
): LocalizedString {
  const next: LocalizedString = { ...current };
  for (const locale of LOCALES) {
    if (!isEmptyLocalizedValue(current[locale])) continue;
    const translated = translations[locale];
    if (typeof translated !== "string") continue;
    if (isEmptyLocalizedValue(translated)) continue;
    next[locale] = translated;
  }
  return next;
}

/**
 * Decide whether a typing event should trigger translation, and which targets.
 * Returns null when there is nothing to do (blank source or no empty siblings).
 */
export function planAutoTranslate(
  fields: LocalizedString,
  sourceLocale: Locale,
  sourceText: string,
): { sourceLocale: Locale; text: string; targetLocales: Locale[] } | null {
  const text = String(sourceText ?? "").trim();
  if (!text) return null;
  const targetLocales = emptySiblingLocales(
    { ...fields, [sourceLocale]: sourceText },
    sourceLocale,
  );
  if (targetLocales.length === 0) return null;
  return { sourceLocale, text, targetLocales };
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Russian",
  uk: "Ukrainian",
  he: "Hebrew",
};
