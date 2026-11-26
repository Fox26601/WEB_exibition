"use client";

import { useMemo, type PointerEvent as ReactPointerEvent } from "react";
import type { Artwork, ArtworkPlacement, FrameId } from "@/lib/catalog-types";
import {
  FRAME_IDS,
  MAX_WALL_HEIGHT_T,
  MIN_WALL_HEIGHT_T,
} from "@/lib/catalog-types";
import { resolvedWallHeightT } from "@/lib/placement-eval";
import { adminEditorStrings, pickLocalized } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import { ArtworkThumb } from "./artwork-thumb";

type Props = {
  artworks: Artwork[];
  locale: Locale;
  placements: ArtworkPlacement[];
  onBeginDrag: (art: Artwork, e: ReactPointerEvent) => void;
  onRemovePlacement: (artworkId: string) => void;
  onSetFrame: (artworkId: string, frameId: FrameId) => void;
  onSetWallHeight: (artworkId: string, wallHeightT: number) => void;
  dragDisabled?: boolean;
  onDragDenied?: () => void;
};


export function ArtPlacementPalette({
  artworks,
  locale,
  placements,
  onBeginDrag,
  onRemovePlacement,
  onSetFrame,
  onSetWallHeight,
  dragDisabled,
  onDragDenied,
}: Props) {
  const placed = useMemo(
    () => new Set(placements.map((p) => p.artworkId)),
    [placements],
  );
  const t = adminEditorStrings(locale);

  return (
    <aside className="flex h-full min-h-0 flex-col border border-[var(--line)] bg-[#1a1612] lg:w-[260px]">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
          {t.placeOnPlan}
        </h3>
        <p className="mt-1 text-[0.7rem] text-[var(--paper-dim)]">
          {t.placeInstructions}
        </p>
      </div>
      <ul
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 touch-pan-y"
        style={{ touchAction: "pan-y" }}
      >
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
                dragDisabled={dragDisabled}
                onBeginDrag={(e) => onBeginDrag(art, e)}
                onDragDenied={onDragDenied}
              />
              {isPlaced ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {placement?.kind === "painting" ? (
                    <>
                      <select
                        className="!py-0.5 !text-[0.65rem]"
                        value={placement.frameId}
                        onPointerDown={(e) => e.stopPropagation()}
                        onChange={(e) =>
                          onSetFrame(art.id, e.target.value as FrameId)
                        }
                      >
                        {FRAME_IDS.filter((f) => f !== "none").map((id) => (
                          <option key={id} value={id}>
                            {id}
                          </option>
                        ))}
                      </select>
                      <label className="flex w-full min-w-[120px] flex-1 items-center gap-1 text-[0.65rem] text-[var(--paper-dim)]">
                        H
                        <input
                          type="range"
                          min={MIN_WALL_HEIGHT_T}
                          max={MAX_WALL_HEIGHT_T}
                          step={0.01}
                          value={resolvedWallHeightT(placement)}
                          onPointerDown={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onSetWallHeight(art.id, Number(e.target.value))
                          }
                          className="min-w-0 flex-1"
                        />
                        <span className="w-8 tabular-nums">
                          {Math.round(resolvedWallHeightT(placement) * 100)}
                        </span>
                      </label>
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-danger !py-0.5 !px-1.5 !text-[0.6rem]"
                    onClick={() => onRemovePlacement(art.id)}
                  >
                    {t.removeFromPlan}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {artworks.length === 0 ? (
        <p className="p-3 text-sm text-[var(--paper-dim)]">
          {t.emptyPlacePalette}
        </p>
      ) : null}
    </aside>
  );
}

function PaletteItem({
  art,
  index,
  locale,
  dragDisabled,
  onBeginDrag,
  onDragDenied,
}: {
  art: Artwork;
  index: number;
  locale: Locale;
  dragDisabled?: boolean;
  onBeginDrag: (e: ReactPointerEvent) => void;
  onDragDenied?: () => void;
}) {
  const t = adminEditorStrings(locale);

  return (
    <div
      className="flex gap-2 select-none touch-none"
      style={{
        cursor: dragDisabled ? "not-allowed" : "grab",
        touchAction: "none",
      }}
      onPointerDown={(e: ReactPointerEvent) => {
        if (e.button !== 0) return;
        if (dragDisabled) {
          onDragDenied?.();
          return;
        }
        onBeginDrag(e);
      }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#0e0c0a] text-[0.65rem]">
        {index}
      </span>
      <ArtworkThumb art={art} sizeClassName="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">
          {pickLocalized(art.title, locale) || t.untitled}
          {!art.published ? (
            <span className="ml-1 text-[0.6rem] uppercase tracking-wide text-[var(--amber)]">
              {t.unpublishedBadge}
            </span>
          ) : null}
        </p>
        <p className="text-[0.65rem] text-[var(--paper-dim)]">
          {art.type === "model" ? t.sculpture : t.painting}
        </p>
      </div>
    </div>
  );
}
