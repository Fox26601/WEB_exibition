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
  RoomShape,
} from "@/lib/catalog-types";
import {
  ENTRANCE_ROOM_ID,
  ROOM_SHAPES,
  normalizeLayout,
} from "@/lib/catalog-types";
import type { Locale } from "@/lib/i18n";
import {
  evaluateArtworkDrop,
  placementWorldPoint,
} from "@/lib/placement-eval";
import { ArtPlacementPalette } from "./art-placement-palette";
import {
  ENTRANCE_PORTAL_EDGE,
  defaultRoomTransform,
  edgeMidpoint,
  edgeNormal,
  edgePoints,
  entranceAsRoom,
  entranceWorldVertices,
  recomputeConnections,
  roomWorldVertices,
  roomsWithEntrance,
  rotateEntranceToAlignPortal,
  softSnapEntrance,
  softSnapRoom,
  type Vec2,
} from "@/lib/layout-geometry";

type SaveStatus = "idle" | "saving" | "saved" | "error";

type EditorMode = "plan" | "place";

type Props = {
  layout: GalleryLayout;
  onLayoutChange: (layout: GalleryLayout) => void;
  saveStatus: SaveStatus;
  saveError?: string;
  onRetrySave?: () => void;
  artworks?: Artwork[];
  locale?: Locale;
};

const SCALE = 36;
const PAD = 40;
const VIEW_W = 720;
const VIEW_H = 520;
const MOVE_GAIN = 0.45;
const STRETCH_GAIN = 0.25;
const DRAG_THRESHOLD_PX = 6;

type PanOffset = { x: number; y: number };

function worldToSvg(
  p: Vec2,
  origin: Vec2,
  pan: PanOffset,
): { x: number; y: number } {
  return {
    x: PAD + (p.x - origin.x) * SCALE + pan.x,
    y: PAD + (p.z - origin.z) * SCALE + pan.y,
  };
}

function svgToWorld(
  clientX: number,
  clientY: number,
  svg: SVGSVGElement,
  origin: Vec2,
  pan: PanOffset,
): Vec2 {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: origin.x, z: origin.z };
  const sp = pt.matrixTransform(ctm.inverse());
  return {
    x: origin.x + (sp.x - PAD - pan.x) / SCALE,
    z: origin.z + (sp.y - PAD - pan.y) / SCALE,
  };
}

function clientDeltaToSvg(
  clientDx: number,
  clientDy: number,
  svg: SVGSVGElement,
): PanOffset {
  const rect = svg.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) {
    return { x: clientDx, y: clientDy };
  }
  return {
    x: clientDx * (VIEW_W / rect.width),
    y: clientDy * (VIEW_H / rect.height),
  };
}

const CANVAS_PAN_ID = "__canvas_pan__";

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

function polygonPath(verts: Vec2[], origin: Vec2, pan: PanOffset): string {
  return (
    verts
      .map((v, i) => {
        const p = worldToSvg(v, origin, pan);
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

type PlaceDragState = {
  art: Artwork;
  source: "palette" | "reposition";
};

type GhostState = {
  world: Vec2;
  ok: boolean;
};

export function GalleryRoomEditor({
  layout,
  onLayoutChange,
  saveStatus,
  saveError,
  onRetrySave,
  artworks,
  locale,
}: Props) {
  const placementEnabled = Boolean(artworks?.length && locale);
  const [editorMode, setEditorMode] = useState<EditorMode>("plan");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedShape, setSelectedShape] = useState<RoomShape>("square");
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [paletteFrame, setPaletteFrame] = useState<FrameId>("wood");
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const [placeToast, setPlaceToast] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const placeDragRef = useRef<PlaceDragState | null>(null);
  const layoutLiveRef = useRef(layout);
  layoutLiveRef.current = layout;
  const panLiveRef = useRef(panOffset);
  panLiveRef.current = panOffset;

  const normalized = useMemo(() => normalizeLayout(layout), [layout]);
  const origin = useMemo(
    () => boundsOrigin(normalized.rooms, normalized.entrance),
    [normalized.rooms, normalized.entrance],
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

  const showPlaceToast = useCallback((message: string) => {
    setPlaceToast(message);
    window.setTimeout(() => setPlaceToast(null), 3200);
  }, []);

  const removePlacement = useCallback(
    (artworkId: string) => {
      const current = normalizeLayout(layoutLiveRef.current);
      commit({
        ...current,
        placements: current.placements.filter((p) => p.artworkId !== artworkId),
      });
    },
    [commit],
  );

  const setPlacementFrame = useCallback(
    (artworkId: string, frameId: FrameId) => {
      const current = normalizeLayout(layoutLiveRef.current);
      commit({
        ...current,
        placements: current.placements.map((p) =>
          p.artworkId === artworkId ? { ...p, frameId } : p,
        ),
      });
    },
    [commit],
  );

  const upsertPlacement = useCallback(
    (placement: import("@/lib/catalog-types").ArtworkPlacement): void => {
      const current = normalizeLayout(layoutLiveRef.current);
      const placements = [
        ...current.placements.filter((p) => p.artworkId !== placement.artworkId),
        placement,
      ];
      commit({ ...current, placements });
    },
    [commit],
  );

  const resolveWorldAtClient = useCallback(
    (clientX: number, clientY: number): Vec2 | null => {
      const svg = svgRef.current;
      if (!svg) return null;
      return svgToWorld(clientX, clientY, svg, origin, panLiveRef.current);
    },
    [origin],
  );

  const endPlaceDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = placeDragRef.current;
      placeDragRef.current = null;
      setGhost(null);
      if (!drag) return;
      const world = resolveWorldAtClient(clientX, clientY);
      if (!world) return;
      const current = normalizeLayout(layoutLiveRef.current);
      const ignoreId =
        drag.source === "reposition" ? drag.art.id : undefined;
      const result = evaluateArtworkDrop(
        drag.art,
        world,
        current,
        paletteFrame,
        ignoreId,
      );
      if (!result.ok) {
        const msg =
          result.reason === "no_snap"
            ? "Подведите ближе к стене."
            : result.reason === "conflict"
              ? "Слишком близко к другой работе."
              : "Отпустите внутри комнаты.";
        showPlaceToast(msg);
        return;
      }
      upsertPlacement(result.placement);
    },
    [paletteFrame, resolveWorldAtClient, showPlaceToast, upsertPlacement],
  );

  const beginPaletteDrag = useCallback(
    (art: Artwork, e: ReactPointerEvent) => {
      if (editorMode !== "place") return;
      placeDragRef.current = { art, source: "palette" };
      const trackPointer = (clientX: number, clientY: number) => {
        const world = resolveWorldAtClient(clientX, clientY);
        if (!world) {
          setGhost(null);
          return;
        }
        const current = normalizeLayout(layoutLiveRef.current);
        const result = evaluateArtworkDrop(
          art,
          world,
          current,
          paletteFrame,
        );
        setGhost({
          world: result.ok ? result.world : world,
          ok: result.ok,
        });
      };
      const onMove = (ev: PointerEvent) => {
        trackPointer(ev.clientX, ev.clientY);
      };
      const onUp = (ev: PointerEvent) => {
        endPlaceDrag(ev.clientX, ev.clientY);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      trackPointer(e.clientX, e.clientY);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [editorMode, endPlaceDrag, paletteFrame, resolveWorldAtClient],
  );

  const beginReposition = useCallback(
    (art: Artwork, e: ReactPointerEvent) => {
      if (editorMode !== "place") return;
      e.preventDefault();
      e.stopPropagation();
      placeDragRef.current = { art, source: "reposition" };
      (e.target as Element).setPointerCapture?.(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        const world = resolveWorldAtClient(ev.clientX, ev.clientY);
        if (!world) {
          setGhost(null);
          return;
        }
        const current = normalizeLayout(layoutLiveRef.current);
        const result = evaluateArtworkDrop(
          art,
          world,
          current,
          paletteFrame,
          art.id,
        );
        setGhost({
          world: result.ok ? result.world : world,
          ok: result.ok,
        });
      };
      const onUp = (ev: PointerEvent) => {
        endPlaceDrag(ev.clientX, ev.clientY);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [editorMode, endPlaceDrag, paletteFrame, resolveWorldAtClient],
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

  type DragMode = "move" | "scale" | "pan";
  const dragRef = useRef<{
    mode: DragMode;
    targetId: string;
    startWorld: Vec2;
    startClientX: number;
    startClientY: number;
    startTransform: GalleryRoom["transform"];
    startEntrance: GalleryEntrancePose;
    startPan: PanOffset;
    moved: boolean;
  } | null>(null);

  function onCanvasPanStart(e: ReactPointerEvent<SVGRectElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    dragRef.current = {
      mode: "pan",
      targetId: CANVAS_PAN_ID,
      startWorld: { x: 0, z: 0 },
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTransform: defaultRoomTransform("square", 0),
      startEntrance: { ...normalized.entrance },
      startPan: { ...panLiveRef.current },
      moved: false,
    };
    setSelectedRoomId(null);
    svg.setPointerCapture(e.pointerId);
  }

  function onBodyPointerDown(
    e: ReactPointerEvent,
    targetId: string,
    mode: DragMode,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;

    if (targetId === ENTRANCE_ROOM_ID) {
      if (mode !== "move") return;
      const world = svgToWorld(
        e.clientX,
        e.clientY,
        svg,
        origin,
        panLiveRef.current,
      );
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
        startPan: { ...panLiveRef.current },
        moved: false,
      };
      setSelectedRoomId(ENTRANCE_ROOM_ID);
      (e.target as Element).setPointerCapture?.(e.pointerId);
      return;
    }

    const room = normalized.rooms.find((r) => r.id === targetId);
    if (!room) return;
    const world = svgToWorld(
      e.clientX,
      e.clientY,
      svg,
      origin,
      panLiveRef.current,
    );
    dragRef.current = {
      mode,
      targetId,
      startWorld: world,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startTransform: { ...room.transform },
      startEntrance: { ...normalized.entrance },
      startPan: { ...panLiveRef.current },
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

      if (drag.mode === "pan") {
        const delta = clientDeltaToSvg(px, py, svg);
        setPanOffset({
          x: drag.startPan.x + delta.x,
          y: drag.startPan.y + delta.y,
        });
        return;
      }

      const current = normalizeLayout(layoutLiveRef.current);
      const world = svgToWorld(
        e.clientX,
        e.clientY,
        svg,
        origin,
        panLiveRef.current,
      );
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
          : { room: moving, snappedTo: null, ownEdge: -1 };
      let entrance = current.entrance;
      if (
        drag.mode === "move" &&
        snapped.snappedTo?.roomId === ENTRANCE_ROOM_ID
      ) {
        entrance = rotateEntranceToAlignPortal(entrance, snapped.snappedTo);
      }
      commit({
        ...current,
        entrance,
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
      let entrance = current.entrance;
      if (snapped.snappedTo?.roomId === ENTRANCE_ROOM_ID) {
        entrance = rotateEntranceToAlignPortal(entrance, snapped.snappedTo);
      }
      commit({
        ...current,
        entrance,
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
  const entranceLinked = normalized.connections.some(
    (c) => c.roomA === ENTRANCE_ROOM_ID || c.roomB === ENTRANCE_ROOM_ID,
  );
  const portalAccent = entranceLinked ? "#8aa0b8" : "#c9a227";
  const entrancePortalOverlay = useMemo(() => {
    const [pa, pb] = edgePoints(entranceVerts, ENTRANCE_PORTAL_EDGE);
    const mid = edgeMidpoint(pa, pb);
    const n = edgeNormal(pa, pb);
    const centroid = roomCentroid(entranceVerts);
    const inwardX = centroid.x - mid.x;
    const inwardZ = centroid.z - mid.z;
    const intoGallery =
      n.x * inwardX + n.z * inwardZ > 0
        ? { x: n.x, z: n.z }
        : { x: -n.x, z: -n.z };
    const spawn = {
      x: mid.x - intoGallery.x * 0.45,
      z: mid.z - intoGallery.z * 0.45,
    };
    const arrowTip = {
      x: mid.x + intoGallery.x * 0.55,
      z: mid.z + intoGallery.z * 0.55,
    };
    const pMid = worldToSvg(mid, origin, panOffset);
    const pSpawn = worldToSvg(spawn, origin, panOffset);
    const pArrow = worldToSvg(arrowTip, origin, panOffset);
  const edgeLines = entranceVerts.map((_, i) => {
      const [ea, eb] = edgePoints(entranceVerts, i);
      const p1 = worldToSvg(ea, origin, panOffset);
      const p2 = worldToSvg(eb, origin, panOffset);
      const isPortal = i === ENTRANCE_PORTAL_EDGE;
      return { i, p1, p2, isPortal };
    });
    return { edgeLines, pMid, pSpawn, pArrow };
  }, [entranceVerts, origin, panOffset]);
  const canDeleteSelected =
    selectedRoomId != null && selectedRoomId !== ENTRANCE_ROOM_ID;

  const planMode = editorMode === "plan";
  const interactRooms = planMode;

  const editorBody = (
    <>
      <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 py-3">
        {placementEnabled ? (
          <div className="flex w-full flex-wrap items-center gap-2 pb-2">
            <button
              type="button"
              className={`btn !py-1.5 !px-3 !text-[0.7rem] ${
                planMode ? "btn-solid" : "btn-ghost"
              }`}
              onClick={() => setEditorMode("plan")}
            >
              Plan
            </button>
            <button
              type="button"
              className={`btn !py-1.5 !px-3 !text-[0.7rem] ${
                !planMode ? "btn-solid" : "btn-ghost"
              }`}
              onClick={() => setEditorMode("place")}
            >
              Place
            </button>
          </div>
        ) : null}
        {planMode
          ? ROOM_SHAPES.map((shape) => (
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
            ))
          : null}
        {planMode && canDeleteSelected ? (
          <button
            type="button"
            className="btn btn-danger !py-1.5 !px-3 !text-[0.7rem]"
            onClick={() => removeRoom(selectedRoomId!)}
          >
            Delete room
          </button>
        ) : null}
        <p
          className="w-full text-sm text-[var(--paper-dim)]"
          title="Entrance: bright edge is the gallery door; spawn is outside. Snap rotates the block for you. Tap entrance for +90°."
        >
          <span className="text-[var(--amber-bright)]">Вход (фойе):</span> не
          комната из списка — портал и spawn. Светлая грань — дверь в галерею;{" "}
          <span className="text-[#8aa0b8]">spawn</span> снаружи. Подведи портал к
          комнате (или комнату ко входу) — поворот подстроится сам. Тап по блоку
          — поворот 90°. По пустому полю — перетаскивание, чтобы сдвинуть вид
          схемы.
          {placementEnabled
            ? " В режиме Place перетащите работу со списка на план или сдвиньте маркер."
            : ""}
          {normalized.rooms.length > 0
            ? ` Комнаты: перетаскивание, угол — stretch; дверей: ${normalized.connections.length}.`
            : " Добавьте хотя бы одну комнату."}
        </p>
      </div>

      <div className="overflow-auto bg-[#12100e] p-2">
        <svg
          ref={svgRef}
          width={VIEW_W}
          height={VIEW_H}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="mx-auto block touch-none"
        >
          <rect
            x={0}
            y={0}
            width={VIEW_W}
            height={VIEW_H}
            fill="#0e0c0a"
            onPointerDown={onCanvasPanStart}
            style={{ cursor: "grab" }}
          />
          <defs>
            <marker
              id="entrance-portal-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={portalAccent} />
            </marker>
          </defs>

          <g>
            <path
              d={polygonPath(entranceVerts, origin, panOffset)}
              fill={entranceSelected ? "#2a3540" : "#1a222c"}
              stroke="none"
              className={interactRooms ? undefined : "pointer-events-none"}
              onPointerDown={
                interactRooms
                  ? (e) => onBodyPointerDown(e, ENTRANCE_ROOM_ID, "move")
                  : undefined
              }
              style={{ cursor: interactRooms ? "grab" : undefined }}
            />
            {entrancePortalOverlay.edgeLines.map(({ i, p1, p2, isPortal }) => (
              <line
                key={`ent-edge-${i}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={isPortal ? portalAccent : "#3a4554"}
                strokeWidth={isPortal ? 4 : 1}
                strokeDasharray={isPortal ? undefined : "4 3"}
                className="pointer-events-none"
              />
            ))}
            <line
              x1={entrancePortalOverlay.pMid.x}
              y1={entrancePortalOverlay.pMid.y}
              x2={entrancePortalOverlay.pArrow.x}
              y2={entrancePortalOverlay.pArrow.y}
              stroke={portalAccent}
              strokeWidth={2}
              markerEnd="url(#entrance-portal-arrow)"
              className="pointer-events-none"
            />
            <circle
              cx={entrancePortalOverlay.pSpawn.x}
              cy={entrancePortalOverlay.pSpawn.y}
              r={5}
              fill="#6a7a8c"
              stroke="#c9d4e0"
              strokeWidth={1.5}
              className="pointer-events-none"
            />
            <text
              x={entrancePortalOverlay.pSpawn.x}
              y={entrancePortalOverlay.pSpawn.y - 10}
              textAnchor="middle"
              fill="#c9d4e0"
              fontSize={9}
              className="pointer-events-none select-none"
            >
              spawn
            </text>
            <text
              x={worldToSvg(roomCentroid(entranceVerts), origin, panOffset).x}
              y={worldToSvg(roomCentroid(entranceVerts), origin, panOffset).y}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#8aa0b8"
              fontSize={11}
              className="pointer-events-none select-none"
            >
              вход
            </text>
          </g>

          {normalized.rooms.map((room) => {
            const selected = room.id === selectedRoomId;
            const verts = roomWorldVertices(room);
            const handle = worldToSvg(
              verts[0] ?? { x: 0, z: 0 },
              origin,
              panOffset,
            );
            const c = roomCentroid(verts);
            const label = worldToSvg(c, origin, panOffset);
            return (
              <g key={room.id}>
                <path
                  d={polygonPath(verts, origin, panOffset)}
                  fill={selected ? "#2a241c" : "#1c1814"}
                  stroke={selected ? "#d4a574" : "#5a4a3a"}
                  strokeWidth={selected ? 2.5 : 1.5}
                  className={interactRooms ? undefined : "pointer-events-none"}
                  onPointerDown={
                    interactRooms
                      ? (e) => onBodyPointerDown(e, room.id, "move")
                      : undefined
                  }
                  style={{ cursor: interactRooms ? "grab" : undefined }}
                />
                {interactRooms ? (
                  <circle
                    cx={handle.x}
                    cy={handle.y}
                    r={7}
                    fill="#d4a574"
                    stroke="#1a1612"
                    strokeWidth={1}
                    onPointerDown={(e) => onBodyPointerDown(e, room.id, "scale")}
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
              panOffset,
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
                className="pointer-events-none"
              />
            );
          })}

          {artworks?.map((art) => {
            const placement = normalized.placements.find(
              (p) => p.artworkId === art.id,
            );
            if (!placement) return null;
            const w = placementWorldPoint(placement, normalized);
            if (!w) return null;
            const pt = worldToSvg(w, origin, panOffset);
            const fill =
              placement.kind === "sculpture" ? "#6a8a6a" : "#c9a227";
            return (
              <rect
                key={`place-${art.id}`}
                x={pt.x - 7}
                y={pt.y - 7}
                width={14}
                height={14}
                fill={fill}
                stroke="#f0e8dc"
                strokeWidth={1.5}
                className={planMode ? "pointer-events-none" : undefined}
                onPointerDown={
                  !planMode ? (e) => beginReposition(art, e) : undefined
                }
                style={{ cursor: !planMode ? "grab" : undefined }}
              />
            );
          })}

          {ghost && !planMode ? (
            <rect
              x={
                worldToSvg(ghost.world, origin, panOffset).x - 9
              }
              y={
                worldToSvg(ghost.world, origin, panOffset).y - 9
              }
              width={18}
              height={18}
              fill={
                ghost.ok
                  ? "rgba(90, 180, 120, 0.55)"
                  : "rgba(200, 90, 80, 0.5)"
              }
              stroke={ghost.ok ? "#7ad49a" : "#e08a7a"}
              strokeWidth={2}
              className="pointer-events-none"
            />
          ) : null}
        </svg>
      </div>
    </>
  );

  return (
    <div className="border border-[var(--line)] bg-[#1a1612]">
      {placeToast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 border border-[var(--amber)]/60 bg-[#1a1612] px-4 py-2 text-sm text-[var(--paper)] shadow-lg"
          role="status"
        >
          {placeToast}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
            Room plan & placement
          </span>
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

      {placementEnabled && artworks && locale ? (
        <div className="flex flex-col lg:flex-row lg:items-stretch">
          <div className="min-w-0 flex-1">{editorBody}</div>
          <ArtPlacementPalette
            artworks={artworks}
            locale={locale}
            placements={normalized.placements}
            paletteFrame={paletteFrame}
            onPaletteFrameChange={setPaletteFrame}
            onBeginDrag={beginPaletteDrag}
            onRemovePlacement={removePlacement}
            onSetFrame={setPlacementFrame}
            disabled={editorMode !== "place"}
          />
        </div>
      ) : (
        editorBody
      )}
    </div>
  );
}

export function ensureLayout(layout?: GalleryLayout | null): GalleryLayout {
  return normalizeLayout(layout);
}
