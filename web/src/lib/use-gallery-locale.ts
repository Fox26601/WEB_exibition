"use client";

import { useCallback, useEffect, useState } from "react";
import { direction, isLocale, type Locale } from "./i18n";

const STORAGE_KEY = "gallery-lang";

function readInitialLocale(fallback: Locale): Locale {
  if (typeof window === "undefined") return fallback;
  const fromUrl = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(fromUrl)) return fromUrl;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  return fallback;
}

/** Shared EN/RU/UK/HE state: URL ?lang= wins, then localStorage, then en. */
export function useGalleryLocale(defaultLocale: Locale = "en") {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    /* Client-only hydrate from URL / storage (SSR stays on defaultLocale). */
    /* eslint-disable react-hooks/set-state-in-effect */
    setLocaleState(readInitialLocale(defaultLocale));
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultLocale]);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
    const url = new URL(window.location.href);
    if (url.searchParams.get("lang") !== locale) {
      url.searchParams.set("lang", locale);
      window.history.replaceState({}, "", url.toString());
    }
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  return { locale, setLocale, dir: direction(locale), ready };
}
