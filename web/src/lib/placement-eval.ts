import type {
  Artwork,
  ArtworkPlacement,
  FrameId,
  GalleryLayout,
  GalleryRoom,
  RoomConnection,
} from "./catalog-types";
import { DEFAULT_WALL_HEIGHT_T, ENTRANCE_ROOM_ID } from "./catalog-types";
import {
  edgeLength,
  edgePoints,
  findRoomAtPoint,
  nearestWall,
  placementConflicts,
  pointAlongEdge,
  pointInPolygon,
  roomCentroid,
  roomWorldVertices,
  yawFromEdge,
  type Vec2,
} from "./layout-geometry";
import {
  placementWorldPoint,
  resolvedWallHeightT,
} from "./placement-pose";

export { placementWorldPoint, resolvedWallHeightT };

export const MAX_WALL_SNAP_DIST = 1.2;
const T_ALONG_MIN = 0.12;
const T_ALONG_MAX = 0.88;
/** Margin outside doorway clear so paintings do not hug the opening edge. */
const DOORWAY_T_MARGIN = 0.02;

export type PlacementDropResult =
  | { ok: true; placement: ArtworkPlacement; world: Vec2 }
  | { ok: false; reason: "no_snap" | "conflict" | "no_room" | "doorway" };

/** Catalog default for paintings when no artwork.frameId is set. */
const DEFAULT_PAINTING_FRAME: FrameId = "wood";

function paintingFrame(art: Artwork): FrameId {
  if (art.type === "model") return "none";
  if (art.frameId && art.frameId !== "none") return art.frameId;
  return DEFAULT_PAINTING_FRAME;
}

type WallSnapHit = {
  room: GalleryRoom;
  edgeIndex: number;
  t: number;
  dist: number;
  a: Vec2;
  b: Vec2;
};

type DoorwayTRange = { t0: number; t1: number };

function connectionForEdge(
  connections: RoomConnection[],
  roomId: string,
  edgeIndex: number,
): RoomConnection | null {
  for (const c of connections) {
    if (c.roomA === roomId && c.edgeA === edgeIndex) return c;
    if (c.roomB === roomId && c.edgeB === edgeIndex) return c;
  }
  return null;
}

/** Forbidden tAlongEdge ranges for doorway / entrance-portal openings on an edge. */
export function doorwayBlockedTRanges(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
  edgeLen: number,
): DoorwayTRange[] {
  if (edgeLen < 0.05) return [];
  const c = connectionForEdge(layout.connections ?? [], roomId, edgeIndex);
  if (!c) return [];
  const doorW = Math.max(0, c.doorwayWidth ?? 0);
  if (doorW <= 0.01) return [];
  const halfT = doorW / edgeLen / 2 + DOORWAY_T_MARGIN;
  return [
    {
      t0: Math.max(0, 0.5 - halfT),
      t1: Math.min(1, 0.5 + halfT),
    },
  ];
}

export function tAlongInDoorway(
  t: number,
  ranges: DoorwayTRange[],
): boolean {
  return ranges.some((r) => t >= r.t0 - 1e-6 && t <= r.t1 + 1e-6);
}

/**
 * Prefer nearest allowed t outside doorway spans; null if the whole snap
 * band is blocked (or no valid band remains).
 */
export function clampTAlongOutsideDoorway(
  t: number,
  ranges: DoorwayTRange[],
): number | null {
  if (!tAlongInDoorway(t, ranges)) {
    return Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, t));
  }
  let best: number | null = null;
  let bestDist = Infinity;
  for (const r of ranges) {
    for (const cand of [r.t0 - 0.001, r.t1 + 0.001]) {
      const clamped = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, cand));
      if (tAlongInDoorway(clamped, ranges)) continue;
      const d = Math.abs(clamped - t);
      if (d < bestDist) {
        bestDist = d;
        best = clamped;
      }
    }
  }
  return best;
}

export function wallSnapPreviewWorld(
  world: Vec2,
  rooms: GalleryRoom[],
  layout?: GalleryLayout,
): Vec2 | null {
  const snap = resolvePaintingWallSnap(world, rooms);
  if (!snap) return null;
  let tAlong = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, snap.t));
  if (layout) {
    const len = edgeLength(snap.a, snap.b);
    const blocked = doorwayBlockedTRanges(
      layout,
      snap.room.id,
      snap.edgeIndex,
      len,
    );
    const clamped = clampTAlongOutsideDoorway(tAlong, blocked);
    if (clamped == null) return null;
    tAlong = clamped;
  }
  return pointAlongEdge(snap.a, snap.b, tAlong);
}

/**
 * Prefer the room containing the pointer (snap to its nearest wall even from
 * the center). Outside rooms, only snap when within MAX_WALL_SNAP_DIST.
 */
function resolvePaintingWallSnap(
  world: Vec2,
  rooms: GalleryRoom[],
): WallSnapHit | null {
  const containing = findRoomAtPoint(world, rooms);
  if (containing) {
    const hit = nearestWall(world, containing);
    if (hit) {
      return {
        room: containing,
        edgeIndex: hit.edgeIndex,
        t: hit.t,
        dist: hit.dist,
        a: hit.a,
        b: hit.b,
      };
    }
  }
  return bestWallSnapWithin(world, rooms, MAX_WALL_SNAP_DIST);
}

function bestWallSnapWithin(
  world: Vec2,
  rooms: GalleryRoom[],
  maxDist: number,
): WallSnapHit | null {
  let best: WallSnapHit | null = null;

  for (const room of rooms) {
    const hit = nearestWall(world, room);
    if (!hit || hit.dist > maxDist) continue;
    if (!best || hit.dist < best.dist) {
      best = {
        room,
        edgeIndex: hit.edgeIndex,
        t: hit.t,
        dist: hit.dist,
        a: hit.a,
        b: hit.b,
      };
    }
  }
  return best;
}

export function evaluateArtworkDrop(
  art: Artwork,
  world: Vec2,
  layout: GalleryLayout,
  ignoreArtworkId?: string,
): PlacementDropResult {
  const isSculpture = art.type === "model";

  if (isSculpture) {
    const room = findRoomAtPoint(world, layout.rooms);
    if (!room) {
      return { ok: false, reason: "no_room" };
    }
    const verts = roomWorldVertices(room);
    if (!pointInPolygon(world, verts)) {
      return { ok: false, reason: "no_room" };
    }
    const placement: ArtworkPlacement = {
      artworkId: art.id,
      kind: "sculpture",
      roomId: room.id,
      floorX: world.x,
      floorZ: world.z,
      yaw: 0,
      frameId: "none",
    };
    if (placementConflicts(placement, layout, ignoreArtworkId)) {
      return { ok: false, reason: "conflict" };
    }
    return { ok: true, placement, world };
  }

  const snap = resolvePaintingWallSnap(world, layout.rooms);
  if (!snap) {
    return { ok: false, reason: "no_snap" };
  }

  const edgeLen = edgeLength(snap.a, snap.b);
  const blocked = doorwayBlockedTRanges(
    layout,
    snap.room.id,
    snap.edgeIndex,
    edgeLen,
  );
  const rawT = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, snap.t));
  // Refuse drops that land in the doorway/portal opening (do not auto-slide).
  if (tAlongInDoorway(rawT, blocked)) {
    return { ok: false, reason: "doorway" };
  }
  const tAlong = rawT;
  const roomVerts = roomWorldVertices(snap.room);
  const centroid = roomCentroid(roomVerts);
  const placement: ArtworkPlacement = {
    artworkId: art.id,
    kind: "painting",
    roomId: snap.room.id,
    wallEdgeIndex: snap.edgeIndex,
    tAlongEdge: tAlong,
    wallHeightT: DEFAULT_WALL_HEIGHT_T,
    yaw: yawFromEdge(snap.a, snap.b, true, centroid),
    frameId: paintingFrame(art),
  };

  if (placementConflicts(placement, layout, ignoreArtworkId)) {
    return { ok: false, reason: "conflict" };
  }

  const along = pointAlongEdge(snap.a, snap.b, tAlong);
  return { ok: true, placement, world: along };
}

/** Recompute painting yaw from wall geometry (inward normal / wall snap). */
export function syncPaintingYaws(layout: GalleryLayout): GalleryLayout {
  if (!layout?.placements?.length || !layout.rooms?.length) return layout;
  const placements = layout.placements.map((p) => {
    if (p.kind !== "painting") return p;
    if (p.wallEdgeIndex == null || !p.roomId) return p;
    const room = layout.rooms.find((r) => r.id === p.roomId);
    if (!room) return p;
    const verts = roomWorldVertices(room);
    const i =
      ((p.wallEdgeIndex % verts.length) + verts.length) % verts.length;
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (!a || !b) return p;
    const yaw = yawFromEdge(a, b, true, roomCentroid(verts));
    return { ...p, yaw };
  });
  return { ...layout, placements };
}

/** True when a room edge participates in an entrance portal connection. */
export function edgeConnectsToEntrance(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
): boolean {
  const c = connectionForEdge(layout.connections ?? [], roomId, edgeIndex);
  if (!c) return false;
  return c.roomA === ENTRANCE_ROOM_ID || c.roomB === ENTRANCE_ROOM_ID;
}
