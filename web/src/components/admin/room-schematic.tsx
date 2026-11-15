"use client";

import { useEffect, useRef, useState } from "react";
import type { Artwork } from "@/lib/catalog-types";
import { ROOM, roomLength, slotPose } from "@/lib/room";

type Props = {
  artworks: Artwork[];
  /** Called with reordered ids (published list order → Unity slot index). */
  onReorder?: (ids: string[]) => void;
  highlightedId?: string | null;
  onSelect?: (id: string) => void;
  /** Locale for slot tooltips (falls back to en). */
  localeTitle?: (art: Artwork) => string;
};

function slotIdFromPoint(clientX: number, clientY: number): string | null {
  const el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  const host = el.closest("[data-slot-id]");
  return host?.getAttribute("data-slot-id") ?? null;
}

export function RoomSchematic({
  artworks,
  onReorder,
  highlightedId,
  onSelect,
  localeTitle,
}: Props) {
  const count = artworks.length;
  const length = roomLength(count);
  const scale = 28;
  const pad = 24;
  const w = ROOM.width * scale;
  const h = length * scale;
  const svgW = w + pad * 2;
  const svgH = h + pad * 2;

  const slots = artworks.map((art, i) => ({
    ...slotPose(i),
    id: art.id,
    label: localeTitle?.(art) || art.title.en || art.id.slice(0, 6),
  }));

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const artworksRef = useRef(artworks);
  const onReorderRef = useRef(onReorder);

  useEffect(() => {
    artworksRef.current = artworks;
    onReorderRef.current = onReorder;
  }, [artworks, onReorder]);

  useEffect(() => {
    if (!dragId) return;

    const onMove = (e: PointerEvent) => {
      const hit = slotIdFromPoint(e.clientX, e.clientY);
      if (hit) setOverId(hit);
    };

    const onUp = (e: PointerEvent) => {
      const fromId = dragIdRef.current;
      const targetId = slotIdFromPoint(e.clientX, e.clientY);
      dragIdRef.current = null;
      setDragId(null);
      setOverId(null);

      const reorder = onReorderRef.current;
      if (!reorder || !fromId || !targetId || fromId === targetId) return;

      const ids = artworksRef.current.map((a) => a.id);
      const from = ids.indexOf(fromId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      const next = [...ids];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      reorder(next);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragId]);

  return (
    <div className="border border-[var(--line)] bg-[#1a1612] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          2D room schematic
        </h2>
        <p className="text-sm text-[var(--paper-dim)]">
          N={count} · L={length.toFixed(1)}m · W={ROOM.width}m
          {onReorder ? " · drag slots to reorder" : ""}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto max-h-80 w-full touch-none select-none"
        role="img"
        aria-label={`Room length ${length} meters for ${count} artworks`}
      >
        <rect
          x={pad}
          y={pad}
          width={w}
          height={h}
          fill="#0e0c0a"
          stroke="#c4893a"
          strokeWidth={2}
        />
        {slots.map((s) => {
          const cx = pad + (s.x + ROOM.width / 2) * scale;
          const cy = pad + s.z * scale;
          const active = highlightedId === s.id || dragId === s.id;
          const dropTarget = overId === s.id && dragId && overId !== dragId;
          return (
            <g
              key={s.id}
              data-slot-id={s.id}
              style={{
                cursor: onReorder ? "grab" : onSelect ? "pointer" : "default",
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                onSelect?.(s.id);
                if (!onReorder) return;
                (e.currentTarget as SVGGElement).setPointerCapture?.(
                  e.pointerId,
                );
                dragIdRef.current = s.id;
                setDragId(s.id);
                setOverId(s.id);
              }}
            >
              <title>{s.label}</title>
              <rect
                x={cx - 10}
                y={cy - 8}
                width={20}
                height={16}
                fill={
                  dropTarget
                    ? "#e0a84a"
                    : active
                      ? "#f0c878"
                      : s.wall === "left"
                        ? "#e0a84a"
                        : "#c9bba6"
                }
                stroke={active || dropTarget ? "#fff" : "none"}
                strokeWidth={dropTarget ? 2 : active ? 1 : 0}
              />
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize={9}
                fill="#0e0c0a"
                style={{ pointerEvents: "none" }}
              >
                {s.index + 1}
              </text>
            </g>
          );
        })}
        {count === 0 ? (
          <text
            x={svgW / 2}
            y={svgH / 2}
            textAnchor="middle"
            fill="#c9bba6"
            fontSize={12}
          >
            Empty L0 room
          </text>
        ) : null}
      </svg>
    </div>
  );
}
