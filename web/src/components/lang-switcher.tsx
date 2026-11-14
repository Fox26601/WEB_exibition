"use client";

import { LOCALES, LOCALE_LABELS, type Locale } from "@/lib/i18n";

export function LangSwitcher({
  value,
  onChange,
  className = "",
}: {
  value: Locale;
  onChange: (locale: Locale) => void;
  className?: string;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1 font-[family-name:var(--font-ui)] text-xs tracking-[0.14em] ${className}`}
      role="group"
      aria-label="Language"
    >
      {LOCALES.map((locale) => (
        <button
          key={locale}
          type="button"
          onClick={() => onChange(locale)}
          className={`px-2 py-1 transition-colors ${
            value === locale
              ? "text-[var(--amber-bright)]"
              : "text-[var(--paper-dim)] hover:text-[var(--paper)]"
          }`}
          aria-pressed={value === locale}
        >
          {LOCALE_LABELS[locale]}
        </button>
      ))}
    </div>
  );
}
