import type {
  Artwork,
  ArtworkPlacement,
  FrameId,
  GalleryLayout,
  GalleryRoom,
} from "./catalog-types";
import { DEFAULT_WALL_HEIGHT_T } from "./catalog-types";
import {
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

export type PlacementDropResult =
  | { ok: true; placement: ArtworkPlacement; world: Vec2 }
  | { ok: false; reason: "no_snap" | "conflict" | "no_room" };

function paintingFrame(art: Artwork, paletteFrame: FrameId): FrameId {
  if (art.type === "model") return "none";
  if (art.frameId && art.frameId !== "none") return art.frameId;
  return paletteFrame;
}

type WallSnapHit = {
  room: GalleryRoom;
  edgeIndex: number;
  t: number;
  dist: number;
  a: Vec2;
  b: Vec2;
};

export function wallSnapPreviewWorld(
  world: Vec2,
  rooms: GalleryRoom[],
): Vec2 | null {
  const snap = resolvePaintingWallSnap(world, rooms);
  if (!snap) return null;
  const tAlong = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, snap.t));
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
  paletteFrame: FrameId,
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

  const tAlong = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, snap.t));
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
    frameId: paintingFrame(art, paletteFrame),
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
