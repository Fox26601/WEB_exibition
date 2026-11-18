"use client";

import { useEffect } from "react";
import {
  advanceBookletPageIndex,
  type BookletPage,
} from "@/lib/catalog-types";
import { pickLocalized, type Locale } from "@/lib/i18n";

type Props = {
  pages: BookletPage[];
  pageIndex: number;
  locale: Locale;
  closeLabel: string;
  onClose: () => void;
  onPage: (index: number) => void;
  /** Bottom-biased sheet under the painting focal area. */
  anchor?: "center" | "below-art";
  /** Non-modal sticky preview for admin editors. */
  embedded?: boolean;
  titleLabel?: string;
};

export function BookletOverlay({
  pages,
  pageIndex,
  locale,
  closeLabel,
  onClose,
  onPage,
  anchor = "center",
  embedded = false,
  titleLabel = "Booklet",
}: Props) {
  const safePages = pages.length > 0 ? pages : [];
  const index = Math.max(0, Math.min(pageIndex, Math.max(0, safePages.length - 1)));
  const page = safePages[index];
  const multi = safePages.length > 1;

  useEffect(() => {
    if (embedded || !multi) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onPage(advanceBookletPageIndex(index, -1, safePages.length));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onPage(advanceBookletPageIndex(index, 1, safePages.length));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embedded, multi, index, onPage, safePages.length]);

  const sheet = (
    <div
      className={`flex w-full max-w-lg flex-col overflow-hidden border border-[var(--line)] bg-[#14110e] ${
        embedded ? "max-h-[min(28rem,70vh)] shadow-lg" : "max-h-[75vh]"
      }`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <span className="font-[family-name:var(--font-display)] text-sm tracking-wide text-white/80">
          {titleLabel}
        </span>
        {!embedded ? (
          <button
            type="button"
            className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
            onClick={onClose}
          >
            {closeLabel}
          </button>
        ) : null}
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
      {multi ? (
        <div className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <button
            type="button"
            className="btn btn-ghost !py-1.5 !px-3 !text-[0.7rem]"
            disabled={index <= 0}
            onClick={() => onPage(advanceBookletPageIndex(index, -1, safePages.length))}
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
            onClick={() => onPage(advanceBookletPageIndex(index, 1, safePages.length))}
          >
            →
          </button>
        </div>
      ) : null}
    </div>
  );

  if (embedded) {
    return <div className="w-full">{sheet}</div>;
  }

  const shellClass =
    anchor === "below-art"
      ? "absolute inset-0 z-30 flex items-end justify-center bg-black/40 px-4 pb-6 pt-28 sm:pb-10 sm:pt-36"
      : "absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center";

  return <div className={shellClass}>{sheet}</div>;
}
