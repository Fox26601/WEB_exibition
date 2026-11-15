"use client";

import { useCallback, useState } from "react";
import type { Artwork } from "@/lib/catalog-types";
import { ROOM, roomLength, slotPose } from "@/lib/room";

type Props = {
  artworks: Artwork[];
  /** Called with reordered ids (all draft arts or published-only — caller decides). */
  onReorder?: (ids: string[]) => void;
  highlightedId?: string | null;
  onSelect?: (id: string) => void;
};

export function RoomSchematic({
  artworks,
  onReorder,
  highlightedId,
  onSelect,
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
    label: art.title.en || art.id.slice(0, 6),
  }));

  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const finishDrag = useCallback(
    (targetId: string | null) => {
      if (!onReorder || !dragId || !targetId || dragId === targetId) {
        setDragId(null);
        setOverId(null);
        return;
      }
      const ids = artworks.map((a) => a.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) {
        setDragId(null);
        setOverId(null);
        return;
      }
      const next = [...ids];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      onReorder(next);
      setDragId(null);
      setOverId(null);
    },
    [artworks, dragId, onReorder],
  );

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
        className="mx-auto max-h-80 w-full touch-none"
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
              style={{ cursor: onReorder ? "grab" : onSelect ? "pointer" : "default" }}
              onPointerDown={(e) => {
                if (!onReorder) {
                  onSelect?.(s.id);
                  return;
                }
                (e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId);
                setDragId(s.id);
                onSelect?.(s.id);
              }}
              onPointerEnter={() => {
                if (dragId) setOverId(s.id);
              }}
              onPointerUp={() => finishDrag(overId || s.id)}
              onPointerCancel={() => {
                setDragId(null);
                setOverId(null);
              }}
            >
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
