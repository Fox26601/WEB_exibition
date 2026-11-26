"use client";

import { useState } from "react";
import type { Locale, LocalizedString } from "@/lib/catalog-types";
import { LOCALES } from "@/lib/catalog-types";
import { mergeOnlyEmptyTranslations } from "@/lib/admin-translate";
import { useAutoTranslateLocalized } from "@/lib/use-auto-translate-localized";

type Props = {
  values: LocalizedString;
  label: string;
  multiline?: boolean;
  rows?: number;
  /** Immediate user edit (source locale updated). */
  onChange: (next: LocalizedString) => void;
  /**
   * Apply API translations via a functional merge against the latest fields.
   * Must call mergeOnlyEmptyTranslations (or equivalent) so filled text stays.
   */
  onApplyTranslations: (
    merge: (current: LocalizedString) => LocalizedString,
  ) => void;
};

/**
 * EN/RU/UK/HE inputs with invisible debounced auto-translate into empty siblings.
 * Also flushes on blur so already-filled locales fill empty twins without retyping.
 * Surfaces a clear inline error when Gemini fails (empties stay empty).
 */
export function LocalizedAutoFields({
  values,
  label,
  multiline = false,
  rows = 4,
  onChange,
  onApplyTranslations,
}: Props) {
  const { schedule, flush } = useAutoTranslateLocalized();
  const [translateError, setTranslateError] = useState("");

  function applyTranslations(
    translations: Partial<Record<Locale, string>>,
  ) {
    setTranslateError("");
    onApplyTranslations((current) =>
      mergeOnlyEmptyTranslations(current, translations),
    );
  }

  function handleChange(locale: Locale, value: string) {
    const next = { ...values, [locale]: value };
    onChange(next);
    schedule(locale, value, next, {
      onTranslations: applyTranslations,
      onError: setTranslateError,
    });
  }

  function handleBlur(locale: Locale) {
    flush(locale, values[locale], values, {
      onTranslations: applyTranslations,
      onError: setTranslateError,
    });
  }

  return (
    <div
      className={
        multiline
          ? "grid gap-3 sm:grid-cols-2"
          : "mb-4 grid gap-3 sm:grid-cols-2"
      }
    >
      {LOCALES.map((locale) => (
        <div key={`${label}-${locale}`}>
          <label>
            {label} ({locale})
          </label>
          {multiline ? (
            <textarea
              rows={rows}
              value={values[locale]}
              onChange={(e) => handleChange(locale, e.target.value)}
              onBlur={() => handleBlur(locale)}
            />
          ) : (
            <input
              value={values[locale]}
              onChange={(e) => handleChange(locale, e.target.value)}
              onBlur={() => handleBlur(locale)}
            />
          )}
        </div>
      ))}
      {translateError ? (
        <p
          className="sm:col-span-2 text-sm text-[#e08a7a]"
          role="alert"
        >
          {translateError}
        </p>
      ) : null}
    </div>
  );
}
