"use client";

import type { BookletPage } from "@/lib/catalog-types";
import { pickLocalized, type Locale } from "@/lib/i18n";

type Props = {
  pages: BookletPage[];
  pageIndex: number;
  locale: Locale;
  closeLabel: string;
  onClose: () => void;
  onPage: (index: number) => void;
};

export function BookletOverlay({
  pages,
  pageIndex,
  locale,
  closeLabel,
  onClose,
  onPage,
}: Props) {
  const safePages = pages.length > 0 ? pages : [];
  const index = Math.max(0, Math.min(pageIndex, Math.max(0, safePages.length - 1)));
  const page = safePages[index];

  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center">
      <div className="flex max-h-[75vh] w-full max-w-lg flex-col overflow-hidden border border-[var(--line)] bg-[#14110e]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
          <span className="font-[family-name:var(--font-display)] text-sm tracking-wide text-white/80">
            Booklet
          </span>
          <button type="button" className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {page ? (
            <>
              <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-bold text-white">
                {pickLocalized(page.title, locale)}
              </h2>
              <p className="whitespace-pre-wrap leading-relaxed text-[var(--paper-dim)]">
                {pickLocalized(page.body, locale) || "—"}
              </p>
            </>
          ) : (
            <p className="text-[var(--paper-dim)]">—</p>
          )}
        </div>
        {safePages.length > 1 ? (
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !px-3 !text-[0.7rem]"
              disabled={index <= 0}
              onClick={() => onPage(index - 1)}
            >
              ←
            </button>
            <span className="text-[0.7rem] text-white/55">
              {index + 1} / {safePages.length}
            </span>
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !px-3 !text-[0.7rem]"
              disabled={index >= safePages.length - 1}
              onClick={() => onPage(index + 1)}
            >
              →
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
