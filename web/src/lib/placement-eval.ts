import type {
  Artwork,
  ArtworkPlacement,
  FrameId,
  GalleryLayout,
  GalleryRoom,
} from "./catalog-types";
import {
  findRoomAtPoint,
  nearestWall,
  placementConflicts,
  pointAlongEdge,
  pointInPolygon,
  roomWorldVertices,
  yawFromEdge,
  type Vec2,
} from "./layout-geometry";

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

function bestWallSnap(
  world: Vec2,
  rooms: GalleryRoom[],
): {
  room: GalleryRoom;
  edgeIndex: number;
  t: number;
  dist: number;
  a: Vec2;
  b: Vec2;
} | null {
  let best: {
    room: GalleryRoom;
    edgeIndex: number;
    t: number;
    dist: number;
    a: Vec2;
    b: Vec2;
  } | null = null;

  for (const room of rooms) {
    const hit = nearestWall(world, room);
    if (!hit || hit.dist > MAX_WALL_SNAP_DIST) continue;
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

  const snap = bestWallSnap(world, layout.rooms);
  if (!snap) {
    return { ok: false, reason: "no_snap" };
  }

  const tAlong = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, snap.t));
  const placement: ArtworkPlacement = {
    artworkId: art.id,
    kind: "painting",
    roomId: snap.room.id,
    wallEdgeIndex: snap.edgeIndex,
    tAlongEdge: tAlong,
    yaw: yawFromEdge(snap.a, snap.b, true),
    frameId: paintingFrame(art, paletteFrame),
  };

  if (placementConflicts(placement, layout, ignoreArtworkId)) {
    return { ok: false, reason: "conflict" };
  }

  const along = pointAlongEdge(snap.a, snap.b, tAlong);
  return { ok: true, placement, world: along };
}

export function placementWorldPoint(
  p: ArtworkPlacement,
  layout: GalleryLayout,
): Vec2 | null {
  if (p.kind === "sculpture") {
    if (p.floorX == null || p.floorZ == null) return null;
    return { x: p.floorX, z: p.floorZ };
  }

  if (
    p.wallEdgeIndex == null ||
    p.tAlongEdge == null ||
    !p.roomId
  ) {
    return null;
  }

  const room = layout.rooms.find((r) => r.id === p.roomId);
  if (!room) return null;
  const verts = roomWorldVertices(room);
  const i =
    ((p.wallEdgeIndex % verts.length) + verts.length) % verts.length;
  const a = verts[i];
  const b = verts[(i + 1) % verts.length];
  if (!a || !b) return null;
  const t = Math.max(0, Math.min(1, p.tAlongEdge));
  return pointAlongEdge(a, b, t);
}