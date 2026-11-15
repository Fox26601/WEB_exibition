"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  Artwork,
  FrameId,
  GalleryEntrancePose,
  GalleryLayout,
  GalleryRoom,
  PlacementKind,
  RoomShape,
  ArtworkPlacement,
} from "@/lib/catalog-types";
import {
  ENTRANCE_ROOM_ID,
  FRAME_IDS,
  ROOM_SHAPES,
  normalizeLayout,
} from "@/lib/catalog-types";
import {
  defaultRoomTransform,
  entranceAsRoom,
  entranceWorldVertices,
  findRoomAtPoint,
  nearestWall,
  placementConflicts,
  pointInPolygon,
  recomputeConnections,
  roomWorldVertices,
  roomsWithEntrance,
  softSnapEntrance,
  softSnapRoom,
  yawFromEdge,
  type Vec2,
} from "@/lib/layout-geometry";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type Props = {
  layout: GalleryLayout;
  artworks: Artwork[];
  localeTitle: (art: Artwork) => string;
  onLayoutChange: (layout: GalleryLayout) => void;
  saveStatus: SaveStatus;
  saveError?: string;
  onRetrySave?: () => void;
};

const SCALE = 36;
const PAD = 40;
const VIEW_W = 720;
const VIEW_H = 520;
const MOVE_GAIN = 0.45;
const STRETCH_GAIN = 0.25;
const DRAG_THRESHOLD_PX = 6;

function worldToSvg(p: Vec2, origin: Vec2): { x: number; y: number } {
  return {
    x: PAD + (p.x - origin.x) * SCALE,
    y: PAD + (p.z - origin.z) * SCALE,
  };
}

function svgToWorld(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  origin: Vec2,
): Vec2 {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: origin.x, z: origin.z };
  const sp = pt.matrixTransform(ctm.inverse());
  return {
    x: origin.x + (sp.x - PAD) / SCALE,
    z: origin.z + (sp.y - PAD) / SCALE,
  };
}

function boundsOrigin(
  rooms: GalleryRoom[],
  entrance: GalleryEntrancePose,
): Vec2 {
  let minX = Infinity;
  let minZ = Infinity;
  const consider = (verts: Vec2[]) => {
    for (const v of verts) {
      minX = Math.min(minX, v.x);
      minZ = Math.min(minZ, v.z);
    }
  };
  for (const room of rooms) consider(roomWorldVertices(room));
  consider(entranceWorldVertices(entrance));
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return { x: -4, z: -1 };
  }
  return { x: minX - 1.5, z: minZ - 1.5 };
}

function polygonPath(verts: Vec2[], origin: Vec2): string {
  return (
    verts
      .map((v, i) => {
        const p = worldToSvg(v, origin);
        return `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      })
      .join(" ") + " Z"
  );
}

function roomCentroid(verts: Vec2[]): Vec2 {
  const n = Math.max(1, verts.length);
  return {
    x: verts.reduce((s, v) => s + v.x, 0) / n,
    z: verts.reduce((s, v) => s + v.z, 0) / n,
  };
}

export function GalleryLayoutEditor({
  layout,
  artworks,
  localeTitle,
  onLayoutChange,
  saveStatus,
  saveError,
  onRetrySave,
}: Props) {
  const [step, setStep] = useState<"rooms" | "art">("rooms");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<RoomShape>("square");
  const [dragArtId, setDragArtId] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{
    kind: PlacementKind;
    x: number;
    z: number;
    valid: boolean;
    placement?: ArtworkPlacement;
  } | null>(null);
  const [paletteFrame, setPaletteFrame] = useState<FrameId>("wood");
  const svgRef = useRef<SVGSVGElement | null>(null);
  const layoutLiveRef = useRef(layout);
  layoutLiveRef.current = layout;

  const normalized = useMemo(() => normalizeLayout(layout), [layout]);
  const origin = useMemo(
    () => boundsOrigin(normalized.rooms, normalized.entrance),
    [normalized.rooms, normalized.entrance],
  );
  const published = useMemo(
    () =>
      [...artworks]
        .filter((a) => a.published)
        .sort((a, b) => a.sort - b.sort),
    [artworks],
  );

  const placedIds = useMemo(
    () => new Set(normalized.placements.map((p) => p.artworkId)),
    [normalized.placements],
  );

  const commit = useCallback(
    (next: GalleryLayout) => {
      const base = normalizeLayout(next);
      const connections = recomputeConnections(
        roomsWithEntrance(base.rooms, base.entrance),
      );
      onLayoutChange({ ...base, connections });
    },
    [onLayoutChange],
  );

  function addRoom(shape: RoomShape) {
    const room: GalleryRoom = {
      id: crypto.randomUUID(),
      shape,
      transform: defaultRoomTransform(shape, normalized.rooms.length),
    };
    const others = roomsWithEntrance(normalized.rooms, normalized.entrance);
    const snapped = softSnapRoom(room, others);
    commit({
      ...normalized,
      rooms: [...normalized.rooms, snapped.room],
    });
    setSelectedRoomId(snapped.room.id);
  }

  function removeRoom(id: string) {
    if (id === ENTRANCE_ROOM_ID) return;
    commit({
      ...normalized,
      rooms: normalized.rooms.filter((r) => r.id !== id),
      placements: normalized.placements.filter((p) => p.roomId !== id),
    });
    if (selectedRoomId === id) setSelectedRoomId(null);
  }

  type DragMode = "move" | "scale";
  const dragRef = useRef<{
    mode: DragMode;
    targetId: string;
    startWorld: Vec2;
    startClientX: number;
    startClientY: number;
    startTransform: GalleryRoom["transform"];
    startEntrance: GalleryEntrancePose;
    moved: boolean;
  } | null>(null);

  function onBodyPointerDown(
    e: ReactPointerEvent,
    targetId: string,
    mode: DragMode,
  ) {
    if (step !== "rooms") return;
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;

    if (targetId === ENTRANCE_ROOM_ID) {
      if (mode !== "move") return;
      const world = svgToWorld(e.clientX, e.clientY, svg, origin);
      dragRef.current = {
        mode: "move",
        targetId: ENTRANCE_ROOM_ID,
        startWorld: world,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startTransform: {
          x: normalized.entrance.x,
          z: normalized.entrance.z,
          rotation: normalized.entrance.rotation,
          scaleX: 1,
          scaleZ: 1,
        },
        startEntrance: { ...normalized.entrance },
        moved: false,
      };
      setSelectedRoomId(ENTRANCE_ROOM_ID);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }

    const room = normalized.rooms.find((r) => r.id === targetId);
    if (!room) return;
    const world = svgToWorld(e.clientX, e.clientY, svg, origin);
    dragRef.current = {
      mode,
      targetId,
      startWorld: world,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTransform: { ...room.transform },
      startEntrance: { ...normalized.entrance },
      moved: false,
    };
    setSelectedRoomId(targetId);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const drag = dragRef.current;
      const svg = svgRef.current;
      if (!drag || !svg) return;

      const px = e.clientX - drag.startClientX;
      const py = e.clientY - drag.startClientY;
      if (
        !drag.moved &&
        Math.hypot(px, py) < DRAG_THRESHOLD_PX
      ) {
        return;
      }
      drag.moved = true;

      const current = normalizeLayout(layoutLiveRef.current);
      const world = svgToWorld(e.clientX, e.clientY, svg, origin);
      const dx = (world.x - drag.startWorld.x) * MOVE_GAIN;
      const dz = (world.z - drag.startWorld.z) * MOVE_GAIN;

      if (drag.targetId === ENTRANCE_ROOM_ID) {
        const raw: GalleryEntrancePose = {
          x: drag.startEntrance.x + dx,
          z: drag.startEntrance.z + dz,
          rotation: drag.startEntrance.rotation,
        };
        const entrance = softSnapEntrance(raw, current.rooms);
        commit({ ...current, entrance });
        return;
      }

      const rooms = current.rooms.map((r) => {
        if (r.id !== drag.targetId) return r;
        if (drag.mode === "move") {
          return {
            ...r,
            transform: {
              ...drag.startTransform,
              x: drag.startTransform.x + dx,
              z: drag.startTransform.z + dz,
            },
            vertices: undefined,
          };
        }
        const stretchDx = (world.x - drag.startWorld.x) * STRETCH_GAIN;
        const stretchDz = (world.z - drag.startWorld.z) * STRETCH_GAIN;
        const scaleX = Math.max(
          1.2,
          drag.startTransform.scaleX + stretchDx,
        );
        const scaleZ = Math.max(
          1.2,
          drag.startTransform.scaleZ + stretchDz,
        );
        return {
          ...r,
          transform: { ...drag.startTransform, scaleX, scaleZ },
          vertices: undefined,
        };
      });
      const moving = rooms.find((r) => r.id === drag.targetId);
      if (!moving) return;
      const others = roomsWithEntrance(
        rooms.filter((r) => r.id !== drag.targetId),
        current.entrance,
      );
      const snapped =
        drag.mode === "move"
          ? softSnapRoom(moving, others)
          : { room: moving };
      commit({
        ...current,
        rooms: rooms.map((r) =>
          r.id === drag.targetId ? snapped.room : r,
        ),
      });
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (!drag || drag.moved || drag.mode !== "move") return;

      const current = normalizeLayout(layoutLiveRef.current);

      if (drag.targetId === ENTRANCE_ROOM_ID) {
        const entrance: GalleryEntrancePose = {
          ...current.entrance,
          rotation: (current.entrance.rotation + 90) % 360,
        };
        const snapped = softSnapEntrance(entrance, current.rooms);
        commit({ ...current, entrance: snapped });
        return;
      }

      const rooms = current.rooms.map((r) => {
        if (r.id !== drag.targetId) return r;
        return {
          ...r,
          transform: {
            ...r.transform,
            rotation: ((r.transform.rotation || 0) + 90) % 360,
          },
          vertices: undefined,
        };
      });
      const moving = rooms.find((r) => r.id === drag.targetId);
      if (!moving) return;
      const others = roomsWithEntrance(
        rooms.filter((r) => r.id !== drag.targetId),
        current.entrance,
      );
      const snapped = softSnapRoom(moving, others);
      commit({
        ...current,
        rooms: rooms.map((r) =>
          r.id === drag.targetId ? snapped.room : r,
        ),
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [commit, origin]);

  function kindForArtwork(art: Artwork): PlacementKind {
    return art.type === "model" ? "sculpture" : "painting";
  }

  function evaluateDrop(art: Artwork, world: Vec2) {
    const kind = kindForArtwork(art);
    const room = findRoomAtPoint(world, normalized.rooms);
    if (!room || room.id === ENTRANCE_ROOM_ID) {
      return { valid: false as const, kind, x: world.x, z: world.z };
    }

    if (kind === "painting") {
      const wall = nearestWall(world, room);
      if (!wall || wall.dist > 1.2) {
        return { valid: false as const, kind, x: world.x, z: world.z };
      }
      const placement: ArtworkPlacement = {
        artworkId: art.id,
        kind,
        roomId: room.id,
        wallEdgeIndex: wall.edgeIndex,
        tAlongEdge: Math.max(0.12, Math.min(0.88, wall.t)),
        yaw: yawFromEdge(wall.a, wall.b, true),
        frameId: art.frameId || paletteFrame,
      };
      const valid = !placementConflicts(placement, normalized, art.id);
      return {
        valid,
        kind,
        x: wall.a.x + (wall.b.x - wall.a.x) * (placement.tAlongEdge ?? 0.5),
        z: wall.a.z + (wall.b.z - wall.a.z) * (placement.tAlongEdge ?? 0.5),
        placement,
      };
    }

    if (!pointInPolygon(world, roomWorldVertices(room))) {
      return { valid: false as const, kind, x: world.x, z: world.z };
    }
    const placement: ArtworkPlacement = {
      artworkId: art.id,
      kind,
      roomId: room.id,
      floorX: world.x,
      floorZ: world.z,
      yaw: 0,
      frameId: "none",
    };
    const valid = !placementConflicts(placement, normalized, art.id);
    return { valid, kind, x: world.x, z: world.z, placement };
  }

  function onPlanPointerMove(e: ReactPointerEvent) {
    if (step !== "art" || !dragArtId || !svgRef.current) return;
    const art = published.find((a) => a.id === dragArtId);
    if (!art) return;
    const world = svgToWorld(e.clientX, e.clientY, svgRef.current, origin);
    const result = evaluateDrop(art, world);
    setGhost(result);
  }

  function onPlanPointerUp() {
    if (step !== "art" || !dragArtId || !ghost?.placement || !ghost.valid) {
      setDragArtId(null);
      setGhost(null);
      return;
    }
    const nextPlacements = [
      ...normalized.placements.filter((p) => p.artworkId !== dragArtId),
      ghost.placement,
    ];
    commit({ ...normalized, placements: nextPlacements });
    setDragArtId(null);
    setGhost(null);
  }

  function removePlacement(artworkId: string) {
    commit({
      ...normalized,
      placements: normalized.placements.filter(
        (p) => p.artworkId !== artworkId,
      ),
    });
  }

  function setPlacementFrame(artworkId: string, frameId: FrameId) {
    commit({
      ...normalized,
      placements: normalized.placements.map((p) =>
        p.artworkId === artworkId ? { ...p, frameId } : p,
      ),
    });
  }

  function resolveConnectionRoom(roomId: string): GalleryRoom | null {
    if (roomId === ENTRANCE_ROOM_ID) {
      return entranceAsRoom(normalized.entrance);
    }
    return normalized.rooms.find((r) => r.id === roomId) ?? null;
  }

  const statusLabel =
    saveStatus === "saving"
      ? "Autosaving draft…"
      : saveStatus === "saved"
        ? "Draft saved"
        : saveStatus === "error"
          ? saveError || "Autosave failed"
          : "";

  const entranceVerts = entranceWorldVertices(normalized.entrance);
  const entranceSelected = selectedRoomId === ENTRANCE_ROOM_ID;
  const canDeleteSelected =
    selectedRoomId != null && selectedRoomId !== ENTRANCE_ROOM_ID;

  return (
    <div className="border border-[var(--line)] bg-[#1a1612]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`btn !py-1.5 !px-3 !text-[0.7rem] ${
              step === "rooms" ? "btn-solid" : "btn-ghost"
            }`}
            onClick={() => setStep("rooms")}
          >
            1 · Rooms
          </button>
          <button
            type="button"
            className={`btn !py-1.5 !px-3 !text-[0.7rem] ${
              step === "art" ? "btn-solid" : "btn-ghost"
            }`}
            onClick={() => setStep("art")}
          >
            2 · Art
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--paper-dim)]">
          <span
            className={
              saveStatus === "error"
                ? "text-[#e08a7a]"
                : "text-[var(--amber-bright)]"
            }
          >
            {statusLabel}
          </span>
          {saveStatus === "error" && onRetrySave ? (
            <button
              type="button"
              className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
              onClick={onRetrySave}
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>

      {step === "rooms" ? (
        <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 py-3">
          {ROOM_SHAPES.map((shape) => (
            <button
              key={shape}
              type="button"
              className={`btn !py-1.5 !px-3 !text-[0.7rem] ${
                selectedShape === shape ? "btn-solid" : "btn-ghost"
              }`}
              onClick={() => {
                setSelectedShape(shape);
                addRoom(shape);
              }}
            >
              + {shape}
            </button>
          ))}
          {canDeleteSelected ? (
            <button
              type="button"
              className="btn btn-danger !py-1.5 !px-3 !text-[0.7rem]"
              onClick={() => removeRoom(selectedRoomId!)}
            >
              Delete room
            </button>
          ) : null}
          {normalized.rooms.length === 0 ? (
            <p className="w-full text-sm text-[var(--paper-dim)]">
              Empty rooms keep the rect L/R gallery fallback. Entrance is always
              on the plan — drag to move, tap to rotate 90°.
            </p>
          ) : (
            <p className="w-full text-sm text-[var(--paper-dim)]">
              Drag rooms to move; corner handle stretches. Tap room to rotate
              90°. Soft snap creates mid-edge doorways (
              {normalized.connections.length}).
            </p>
          )}
        </div>
      ) : (
        <div className="border-b border-[var(--line)] px-4 py-3">
          <p className="mb-2 text-sm text-[var(--paper-dim)]">
            Drag works onto the plan. Paintings snap to walls; sculptures to the
            floor. Red ghost = invalid / occupied.
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
              Frame
            </span>
            {FRAME_IDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`btn !py-1 !px-2 !text-[0.65rem] ${
                  paletteFrame === id ? "btn-solid" : "btn-ghost"
                }`}
                onClick={() => setPaletteFrame(id)}
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-auto bg-[#12100e] p-2">
        <svg
          ref={svgRef}
          width={VIEW_W}
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto block touch-none"
          onPointerMove={onPlanPointerMove}
          onPointerUp={onPlanPointerUp}
          onPointerLeave={() => {
            if (!dragArtId) setGhost(null);
          }}
        >
          <rect
            x={0}
            y={0}
            width={VIEW_W}
            height={VIEW_H}
            fill="#0e0c0a"
          />

          <g>
            <path
              d={polygonPath(entranceVerts, origin)}
              fill={entranceSelected ? "#2a3540" : "#1a222c"}
              stroke={entranceSelected ? "#8aa0b8" : "#4a5c70"}
              strokeWidth={entranceSelected ? 2.5 : 1.5}
              onPointerDown={(e) =>
                onBodyPointerDown(e, ENTRANCE_ROOM_ID, "move")
              }
              style={{ cursor: step === "rooms" ? "grab" : "default" }}
            />
            <text
              x={worldToSvg(roomCentroid(entranceVerts), origin).x}
              y={worldToSvg(roomCentroid(entranceVerts), origin).y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#8aa0b8"
              fontSize={11}
              className="pointer-events-none select-none"
            >
              entrance
            </text>
          </g>

          {normalized.rooms.map((room) => {
            const selected = room.id === selectedRoomId;
            const verts = roomWorldVertices(room);
            const handle = worldToSvg(verts[0] ?? { x: 0, z: 0 }, origin);
            const c = roomCentroid(verts);
            const label = worldToSvg(c, origin);
            return (
              <g key={room.id}>
                <path
                  d={polygonPath(verts, origin)}
                  fill={selected ? "#2a241c" : "#1c1814"}
                  stroke={selected ? "#d4a574" : "#5a4a3a"}
                  strokeWidth={selected ? 2.5 : 1.5}
                  onPointerDown={(e) =>
                    onBodyPointerDown(e, room.id, "move")
                  }
                  style={{ cursor: step === "rooms" ? "grab" : "default" }}
                />
                {step === "rooms" ? (
                  <circle
                    cx={handle.x}
                    cy={handle.y}
                    r={7}
                    fill="#d4a574"
                    stroke="#1a1612"
                    strokeWidth={1}
                    onPointerDown={(e) =>
                      onBodyPointerDown(e, room.id, "scale")
                    }
                    style={{ cursor: "nwse-resize" }}
                  />
                ) : null}
                <text
                  x={label.x}
                  y={label.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#9a8b78"
                  fontSize={11}
                  className="pointer-events-none select-none"
                >
                  {room.shape}
                </text>
              </g>
            );
          })}

          {normalized.connections.map((c, i) => {
            const roomA = resolveConnectionRoom(c.roomA);
            if (!roomA) return null;
            const verts = roomWorldVertices(roomA);
            const a = verts[c.edgeA % verts.length];
            const b = verts[(c.edgeA + 1) % verts.length];
            if (!a || !b) return null;
            const mid = worldToSvg(
              { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 },
              origin,
            );
            return (
              <rect
                key={`door-${i}`}
                x={mid.x - 8}
                y={mid.y - 4}
                width={16}
                height={8}
                fill="#3d4a5c"
                stroke="#8aa0b8"
                strokeWidth={1}
              />
            );
          })}

          {normalized.placements.map((p) => {
            const art = artworks.find((a) => a.id === p.artworkId);
            const pos =
              p.kind === "sculpture"
                ? worldToSvg(
                    { x: p.floorX ?? 0, z: p.floorZ ?? 0 },
                    origin,
                  )
                : (() => {
                    const room = normalized.rooms.find(
                      (r) => r.id === p.roomId,
                    );
                    if (!room || p.wallEdgeIndex == null) return null;
                    const verts = roomWorldVertices(room);
                    const a = verts[p.wallEdgeIndex % verts.length];
                    const b = verts[(p.wallEdgeIndex + 1) % verts.length];
                    if (!a || !b) return null;
                    const t = p.tAlongEdge ?? 0.5;
                    return worldToSvg(
                      {
                        x: a.x + (b.x - a.x) * t,
                        z: a.z + (b.z - a.z) * t,
                      },
                      origin,
                    );
                  })();
            if (!pos) return null;
            return (
              <g key={p.artworkId}>
                <rect
                  x={pos.x - (p.kind === "sculpture" ? 8 : 10)}
                  y={pos.y - (p.kind === "sculpture" ? 8 : 7)}
                  width={p.kind === "sculpture" ? 16 : 20}
                  height={p.kind === "sculpture" ? 16 : 14}
                  fill={p.kind === "sculpture" ? "#6a8f6a" : "#c4a574"}
                  stroke="#1a1612"
                  strokeWidth={1}
                  onClick={() => {
                    if (step === "art") removePlacement(p.artworkId);
                  }}
                  style={{
                    cursor: step === "art" ? "pointer" : "default",
                  }}
                />
                <title>
                  {art ? localeTitle(art) : p.artworkId}
                  {step === "art" ? " — click to remove" : ""}
                </title>
              </g>
            );
          })}

          {ghost ? (
            <rect
              x={worldToSvg({ x: ghost.x, z: ghost.z }, origin).x - 10}
              y={worldToSvg({ x: ghost.x, z: ghost.z }, origin).y - 8}
              width={20}
              height={16}
              fill={
                ghost.valid
                  ? "rgba(140,190,120,0.55)"
                  : "rgba(200,80,70,0.55)"
              }
              stroke={ghost.valid ? "#8cbe78" : "#e08a7a"}
              strokeWidth={2}
              className="pointer-events-none"
            />
          ) : null}
        </svg>
      </div>

      {step === "art" ? (
        <div className="border-t border-[var(--line)] px-4 py-3">
          <h3 className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
            Palette · publishable works
          </h3>
          <ul className="flex gap-3 overflow-x-auto pb-2">
            {published.map((art, i) => {
              const placed = placedIds.has(art.id);
              const placement = normalized.placements.find(
                (p) => p.artworkId === art.id,
              );
              return (
                <li
                  key={art.id}
                  className={`relative w-28 shrink-0 border p-2 ${
                    dragArtId === art.id
                      ? "border-[var(--amber)] bg-[#221c16]"
                      : "border-[var(--line)] bg-[#161310]"
                  } ${placed ? "opacity-60" : ""}`}
                  draggable={false}
                  onPointerDown={() => {
                    if (normalized.rooms.length === 0) return;
                    setDragArtId(art.id);
                  }}
                  style={{
                    cursor: normalized.rooms.length ? "grab" : "not-allowed",
                  }}
                >
                  <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center bg-[#0e0c0a] text-[0.65rem]">
                    {i + 1}
                  </span>
                  <div className="mb-2 aspect-square overflow-hidden bg-[#0e0c0a]">
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
                  <p className="truncate text-xs">
                    {localeTitle(art) || "(untitled)"}
                  </p>
                  <p className="text-[0.65rem] text-[var(--paper-dim)]">
                    {art.type === "model" ? "sculpture" : "painting"}
                    {placed ? " · placed" : ""}
                  </p>
                  {placement && placement.kind === "painting" ? (
                    <select
                      className="mt-1 w-full !py-0.5 !text-[0.65rem]"
                      value={placement.frameId}
                      onChange={(e) =>
                        setPlacementFrame(
                          art.id,
                          e.target.value as FrameId,
                        )
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                    >
                      {FRAME_IDS.map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {published.length === 0 ? (
            <p className="text-sm text-[var(--paper-dim)]">
              Publish artworks first, then place them here.
            </p>
          ) : null}
          {normalized.rooms.length === 0 ? (
            <p className="mt-2 text-sm text-[#e08a7a]">
              Add rooms in step 1 before placing art.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ensureLayout(layout?: GalleryLayout | null): GalleryLayout {
  return normalizeLayout(layout);
}
