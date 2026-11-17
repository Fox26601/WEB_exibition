"use client";

import {
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { Artwork, ArtworkPlacement, FrameId } from "@/lib/catalog-types";
import {
  FRAME_IDS,
  MAX_WALL_HEIGHT_T,
  MIN_WALL_HEIGHT_T,
} from "@/lib/catalog-types";
import { resolvedWallHeightT } from "@/lib/placement-eval";
import { adminEditorStrings, pickLocalized } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const DRAG_THRESHOLD_PX = 6;

type Props = {
  artworks: Artwork[];
  locale: Locale;
  placements: ArtworkPlacement[];
  paletteFrame: FrameId;
  onPaletteFrameChange: (f: FrameId) => void;
  onBeginDrag: (
    art: Artwork,
    captureEl: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
  onRemovePlacement: (artworkId: string) => void;
  onSetFrame: (artworkId: string, frameId: FrameId) => void;
  onSetWallHeight: (artworkId: string, wallHeightT: number) => void;
  dragDisabled?: boolean;
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
  onSetWallHeight,
  dragDisabled,
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
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[0.65rem] text-[var(--paper-dim)]">
            {t.frame}
          </span>
          {FRAME_IDS.filter((id) => id !== "none").map((id) => (
            <button
              key={id}
              type="button"
              className={`btn !py-0.5 !px-1.5 !text-[0.6rem] ${
                paletteFrame === id ? "btn-solid" : "btn-ghost"
              }`}
              onClick={() => onPaletteFrameChange(id)}
              disabled={dragDisabled}
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
                dragDisabled={dragDisabled}
                onBeginDrag={(el, x, y) => onBeginDrag(art, el, x, y)}
              />
              {isPlaced ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {placement?.kind === "painting" ? (
                    <>
                      <select
                        className="!py-0.5 !text-[0.65rem]"
                        value={placement.frameId}
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
                    {t.remove}
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {artworks.length === 0 ? (
        <p className="p-3 text-sm text-[var(--paper-dim)]">
          {t.publishArtworksFirst}
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
}: {
  art: Artwork;
  index: number;
  locale: Locale;
  dragDisabled?: boolean;
  onBeginDrag: (
    captureEl: HTMLElement,
    clientX: number,
    clientY: number,
  ) => void;
}) {
  const t = adminEditorStrings(locale);
  const dragActiveRef = useRef(false);

  return (
    <div
      className="flex gap-2 touch-none select-none"
      style={{ cursor: dragDisabled ? "not-allowed" : "grab" }}
      onPointerDown={(e: ReactPointerEvent) => {
        if (dragDisabled || e.button !== 0) return;
        dragActiveRef.current = false;
        const el = e.currentTarget as HTMLElement;
        const startX = e.clientX;
        const startY = e.clientY;
        const pointerId = e.pointerId;

        const onMove = (ev: PointerEvent) => {
          if (dragActiveRef.current) return;
          const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
          if (dist < DRAG_THRESHOLD_PX) return;
          dragActiveRef.current = true;
          ev.preventDefault();
          el.setPointerCapture(pointerId);
          onBeginDrag(el, ev.clientX, ev.clientY);
        };

        const cleanup = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
          window.removeEventListener("pointercancel", onUp);
        };

        const onUp = (ev: PointerEvent) => {
          if (el.hasPointerCapture(pointerId)) {
            el.releasePointerCapture(pointerId);
          }
          cleanup();
          if (!dragActiveRef.current) {
            void ev;
          }
        };

        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
        window.addEventListener("pointercancel", onUp);
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
          {pickLocalized(art.title, locale) || t.untitled}
        </p>
        <p className="text-[0.65rem] text-[var(--paper-dim)]">
          {art.type === "model" ? t.sculpture : t.painting}
        </p>
      </div>
    </div>
  );
}