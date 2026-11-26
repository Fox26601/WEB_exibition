"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Locale, LocalizedString } from "./catalog-types";
import { planAutoTranslate } from "./admin-translate";
import { requestTranslations } from "./admin-translate-client";

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

  const run = useCallback(
    (
      sourceLocale: Locale,
      sourceText: string,
      currentFields: LocalizedString,
      onTranslations: (
        translations: Partial<Record<Locale, string>>,
      ) => void,
      delayMs: number,
    ) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      abortRef.current = null;

      const plan = planAutoTranslate(currentFields, sourceLocale, sourceText);
      if (!plan) return;

      const seq = ++seqRef.current;
      const kick = () => {
        const controller = new AbortController();
        abortRef.current = controller;
        void (async () => {
          const translations = await requestTranslations(
            currentFields,
            sourceLocale,
            sourceText,
            controller.signal,
          );
          if (seq !== seqRef.current) return;
          if (!translations || Object.keys(translations).length === 0) return;
          onTranslations(translations);
        })();
      };

      if (delayMs <= 0) {
        kick();
        return;
      }
      timerRef.current = setTimeout(kick, delayMs);
    },
    [],
  );

  const schedule = useCallback(
    (
      sourceLocale: Locale,
      sourceText: string,
      currentFields: LocalizedString,
      onTranslations: (
        translations: Partial<Record<Locale, string>>,
      ) => void,
    ) => {
      run(sourceLocale, sourceText, currentFields, onTranslations, debounceMs);
    },
    [debounceMs, run],
  );

  /** Immediate translate (blur / explicit flush) — still soft-fails. */
  const flush = useCallback(
    (
      sourceLocale: Locale,
      sourceText: string,
      currentFields: LocalizedString,
      onTranslations: (
        translations: Partial<Record<Locale, string>>,
      ) => void,
    ) => {
      run(sourceLocale, sourceText, currentFields, onTranslations, 0);
    },
    [run],
  );

  return { schedule, flush };
}
