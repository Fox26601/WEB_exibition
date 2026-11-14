"use client";

import { ROOM, roomLength, slotPose } from "@/lib/room";

export function RoomSchematic({ count }: { count: number }) {
  const length = roomLength(count);
  const scale = 28;
  const pad = 24;
  const w = ROOM.width * scale;
  const h = length * scale;
  const svgW = w + pad * 2;
  const svgH = h + pad * 2;

  const slots = Array.from({ length: count }, (_, i) => slotPose(i));

  return (
    <div className="border border-[var(--line)] bg-[#1a1612] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          2D room schematic
        </h2>
        <p className="text-sm text-[var(--paper-dim)]">
          N={count} · L={length.toFixed(1)}m · W={ROOM.width}m
        </p>
      </div>
      <svg
        viewBox={`0 0 ${svgW} ${svgH}`}
        className="mx-auto max-h-80 w-full"
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
          return (
            <g key={s.index}>
              <rect
                x={cx - 8}
                y={cy - 6}
                width={16}
                height={12}
                fill={s.wall === "left" ? "#e0a84a" : "#c9bba6"}
              />
              <text
                x={cx}
                y={cy + 3}
                textAnchor="middle"
                fontSize={8}
                fill="#0e0c0a"
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
