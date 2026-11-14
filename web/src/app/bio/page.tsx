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

export default function BioPage() {
  const [locale, setLocale] = useState<Locale>("en");
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    const stored = localStorage.getItem("gallery-lang");
    if (isLocale(q)) setLocale(q);
    else if (isLocale(stored)) setLocale(stored);

    fetch("/api/catalog?catalog=live")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, []);

  useEffect(() => {
    localStorage.setItem("gallery-lang", locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);

  const copy = UI[locale];
  const bio = catalog ? pickLocalized(catalog.settings.bio, locale) : "…";

  return (
    <div
      dir={direction(locale)}
      className="grain atmosphere relative min-h-screen"
    >
      <div className="relative z-10 mx-auto max-w-3xl px-6 py-8 sm:px-10">
        <div className="mb-12 flex items-center justify-between gap-4">
          <Link
            href={`/?lang=${locale}`}
            className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight"
          >
            Atelier
          </Link>
          <LangSwitcher value={locale} onChange={setLocale} />
        </div>
        <h1 className="mb-6 font-[family-name:var(--font-ui)] text-xs uppercase tracking-[0.24em] text-[var(--amber)]">
          {copy.bio}
        </h1>
        <p className="whitespace-pre-wrap text-lg leading-relaxed text-[var(--paper)]">
          {bio}
        </p>
        <div className="mt-12">
          <Link href={`/?lang=${locale}`} className="btn btn-ghost">
            ←
          </Link>
        </div>
      </div>
    </div>
  );
}
