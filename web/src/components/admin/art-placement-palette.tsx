"use client";

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import type { Artwork, ArtworkPlacement, FrameId } from "@/lib/catalog-types";
import { FRAME_IDS } from "@/lib/catalog-types";
import { pickLocalized } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

type Props = {
  artworks: Artwork[];
  locale: Locale;
  placements: ArtworkPlacement[];
  paletteFrame: FrameId;
  onPaletteFrameChange: (f: FrameId) => void;
  onBeginDrag: (art: Artwork, e: ReactPointerEvent) => void;
  onRemovePlacement: (artworkId: string) => void;
  onSetFrame: (artworkId: string, frameId: FrameId) => void;
  disabled?: boolean;
};

export function ArtPlacementPalette({
  artworks,
  locale,
  placements,
  paletteFrame,
  onPaletteFrameChange,
  onBeginDrag,
  onRemovePlacement,
  onSetFrame,
  disabled,
}: Props) {
  const placed = useMemo(
    () => new Set(placements.map((p) => p.artworkId)),
    [placements],
  );

  return (
    <aside className="flex h-full min-h-0 flex-col border border-[var(--line)] bg-[#1a1612] lg:w-[260px]">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
          Place on plan
        </h3>
        <p className="mt-1 text-[0.7rem] text-[var(--paper-dim)]">
          Картину — на стену; скульптуру — на пол. Зелёный призрак = можно
          отпустить.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[0.65rem] text-[var(--paper-dim)]">Frame</span>
          {FRAME_IDS.filter((id) => id !== "none").map((id) => (
            <button
              key={id}
              type="button"
              className={`btn !py-0.5 !px-1.5 !text-[0.6rem] ${
                paletteFrame === id ? "btn-solid" : "btn-ghost"
              }`}
              onClick={() => onPaletteFrameChange(id)}
              disabled={disabled}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {artworks.map((art, i) => {
          const placement = placements.find((p) => p.artworkId === art.id);
          const isPlaced = placed.has(art.id);
          return (
            <li
              key={art.id}
              className={`border p-2 ${
                isPlaced
                  ? "border-[var(--amber)]/50 bg-[#221c16]"
                  : "border-[var(--line)] bg-[#161310]"
              }`}
            >
              <PaletteItem
                art={art}
                index={i + 1}
                locale={locale}
                disabled={disabled}
                onBeginDrag={(e) => onBeginDrag(art, e)}
              />
              {isPlaced ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {placement?.kind === "painting" ? (
                    <select
                      className="!py-0.5 !text-[0.65rem]"
                      value={placement.frameId}
                      onChange={(e) =>
                        onSetFrame(art.id, e.target.value as FrameId)
                      }
                      disabled={disabled}
                    >
                      {FRAME_IDS.filter((f) => f !== "none").map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-danger !py-0.5 !px-1.5 !text-[0.6rem]"
                    disabled={disabled}
                    onClick={() => onRemovePlacement(art.id)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {artworks.length === 0 ? (
        <p className="p-3 text-sm text-[var(--paper-dim)]">
          Publish artworks first, then place them on the plan.
        </p>
      ) : null}
    </aside>
  );
}

function PaletteItem({
  art,
  index,
  locale,
  disabled,
  onBeginDrag,
}: {
  art: Artwork;
  index: number;
  locale: Locale;
  disabled?: boolean;
  onBeginDrag: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      className="flex gap-2 touch-none select-none"
      style={{ cursor: disabled ? "not-allowed" : "grab" }}
      onPointerDown={(e: ReactPointerEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onBeginDrag(e);
      }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#0e0c0a] text-[0.65rem]">
        {index}
      </span>
      <div className="h-12 w-12 shrink-0 overflow-hidden bg-[#0e0c0a]">
        {art.type === "model" ? (
          <div className="flex h-full items-center justify-center text-[0.65rem] text-[var(--paper-dim)]">
            GLB
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art.urlWall || art.urlPoster || ""}
            alt=""
            className="h-full w-full object-cover pointer-events-none"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">
          {pickLocalized(art.title, locale) || "(untitled)"}
        </p>
        <p className="text-[0.65rem] text-[var(--paper-dim)]">
          {art.type === "model" ? "sculpture" : "painting"}
        </p>
      </div>
    </div>
  );
}