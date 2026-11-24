"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Locale, LocalizedString } from "./catalog-types";
import { planAutoTranslate } from "./admin-translate";

const DEFAULT_DEBOUNCE_MS = 650;

/**
 * Debounced invisible auto-translate for one LocalizedString group
 * (e.g. artwork titles, or one booklet page's titles/bodies).
 * Cancels in-flight requests on new input; caller must merge with
 * mergeOnlyEmptyTranslations so non-empty fields are never overwritten.
 */
export function useAutoTranslateLocalized(debounceMs = DEFAULT_DEBOUNCE_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const schedule = useCallback(
    (
      sourceLocale: Locale,
      sourceText: string,
      currentFields: LocalizedString,
      onTranslations: (
        translations: Partial<Record<Locale, string>>,
      ) => void,
    ) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      abortRef.current = null;

      const plan = planAutoTranslate(currentFields, sourceLocale, sourceText);
      if (!plan) return;

      const seq = ++seqRef.current;
      timerRef.current = setTimeout(() => {
        const controller = new AbortController();
        abortRef.current = controller;
        void (async () => {
          try {
            const res = await fetch("/api/admin/translate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                text: plan.text,
                sourceLocale: plan.sourceLocale,
                targetLocales: plan.targetLocales,
                fields: currentFields,
              }),
            });
            if (!res.ok) return;
            const data = (await res.json()) as {
              translations?: Partial<Record<Locale, string>>;
            };
            if (seq !== seqRef.current) return;
            const translations = data.translations;
            if (!translations || typeof translations !== "object") return;
            onTranslations(translations);
          } catch {
            // Abort or network — leave empties as-is.
          }
        })();
      }, debounceMs);
    },
    [debounceMs],
  );

  return { schedule };
}
