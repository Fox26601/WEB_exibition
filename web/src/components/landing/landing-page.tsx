"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Catalog } from "@/lib/catalog-types";
import {
  UI,
  direction,
  pickLocalized,
  type Locale,
  isLocale,
} from "@/lib/i18n";
import { LangSwitcher } from "@/components/lang-switcher";

const BRAND = "Atelier";

export function LandingPage({ initialCatalog }: { initialCatalog: Catalog }) {
  const [locale, setLocale] = useState<Locale>("en");
  const [catalog] = useState(initialCatalog);

  useEffect(() => {
    const stored = localStorage.getItem("gallery-lang");
    if (isLocale(stored)) setLocale(stored);
  }, []);

  useEffect(() => {
    localStorage.setItem("gallery-lang", locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);

  const copy = UI[locale];
  const poster = pickLocalized(catalog.settings.poster, locale);
  const dir = direction(locale);

  return (
    <div
      dir={dir}
      className="grain atmosphere relative min-h-screen overflow-hidden"
    >
      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-6 sm:px-10 sm:py-8">
        <header className="animate-fade flex items-start justify-between gap-4">
          <p className="font-[family-name:var(--font-ui)] text-[0.7rem] uppercase tracking-[0.28em] text-[var(--paper-dim)]">
            Online gallery
          </p>
          <LangSwitcher value={locale} onChange={setLocale} />
        </header>

        <main className="relative flex flex-1 flex-col justify-center py-16 sm:py-20">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-8 start-0 w-px bg-gradient-to-b from-transparent via-[var(--amber)] to-transparent opacity-60 animate-pulse-line max-sm:hidden"
          />

          <p className="animate-rise mb-3 font-[family-name:var(--font-display)] text-[clamp(3.5rem,14vw,9rem)] font-extrabold leading-[0.9] tracking-tight text-[var(--paper)]">
            {BRAND}
          </p>

          <h1 className="animate-rise-delay max-w-xl font-[family-name:var(--font-body)] text-[clamp(1.15rem,2.6vw,1.65rem)] font-normal leading-relaxed text-[var(--paper-dim)]">
            {poster}
          </h1>

          <div className="animate-rise-delay mt-10 flex flex-wrap items-center gap-4">
            <Link href={`/exhibition?lang=${locale}`} className="btn btn-solid">
              {copy.enter}
            </Link>
          </div>
        </main>

        <footer className="animate-fade flex flex-wrap items-center gap-x-8 gap-y-3 border-t border-[var(--line)] pt-5 font-[family-name:var(--font-ui)] text-sm text-[var(--paper-dim)]">
          <Link
            href={`/bio?lang=${locale}`}
            className="hover:text-[var(--amber-bright)] transition-colors"
          >
            {copy.bio}
          </Link>
          {catalog.settings.instagram ? (
            <a
              href={catalog.settings.instagram}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--amber-bright)] transition-colors"
            >
              {copy.instagram}
            </a>
          ) : null}
          {catalog.settings.email ? (
            <a
              href={`mailto:${catalog.settings.email}`}
              className="hover:text-[var(--amber-bright)] transition-colors"
            >
              {copy.email}
            </a>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
