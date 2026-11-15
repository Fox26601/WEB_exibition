import type {
  GalleryEntrancePose,
  GalleryLayout,
  GalleryRoom,
  RoomConnection,
  RoomShape,
  RoomTransform,
  ArtworkPlacement,
} from "./catalog-types";
import {
  DEFAULT_ENTRANCE_POSE,
  ENTRANCE_ROOM_ID,
} from "./catalog-types";

export type Vec2 = { x: number; z: number };

/** Schematic entrance footprint (Unity corridor depth stays 6 in world build). */
export const ENTRANCE_WIDTH = 2.4;
export const ENTRANCE_DEPTH = 3.0;
/** Portal edge index for entranceWorldVertices (+local Z side). */
export const ENTRANCE_PORTAL_EDGE = 2;

/** Unit-radius regular polygon in local XZ ( circumradius ≈ 1 before scale). */
export function shapeLocalVertices(shape: RoomShape): Vec2[] {
  const n =
    shape === "triangle"
      ? 3
      : shape === "square"
        ? 4
        : shape === "pentagon"
          ? 5
          : 6;
  const verts: Vec2[] = [];
  // Square aligned to axes; others start with a flat / tip facing +Z for readable snaps.
  const start =
    shape === "square" ? Math.PI / 4 : shape === "triangle" ? -Math.PI / 2 : 0;
  for (let i = 0; i < n; i++) {
    const a = start + (i * 2 * Math.PI) / n;
    verts.push({ x: Math.cos(a), z: Math.sin(a) });
  }
  return verts;
}

export function applyTransform(local: Vec2, t: RoomTransform): Vec2 {
  const sx = local.x * (t.scaleX || 1);
  const sz = local.z * (t.scaleZ || 1);
  const rad = ((t.rotation || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return {
    x: t.x + sx * c - sz * s,
    z: t.z + sx * s + sz * c,
  };
}

export function roomWorldVertices(room: GalleryRoom): Vec2[] {
  if (room.vertices && room.vertices.length >= 3) {
    return room.vertices.map((v) => ({ x: v.x, z: v.z }));
  }
  return shapeLocalVertices(room.shape).map((v) =>
    applyTransform(v, room.transform),
  );
}

export function edgePoints(verts: Vec2[], edgeIndex: number): [Vec2, Vec2] {
  const i = ((edgeIndex % verts.length) + verts.length) % verts.length;
  const j = (i + 1) % verts.length;
  return [verts[i], verts[j]];
}

export function edgeMidpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

export function edgeLength(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.hypot(dx, dz);
}

export function pointAlongEdge(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

/** Outward-ish normal in XZ (not guaranteed outward without winding check). */
export function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: -dz / len, z: dx / len };
}

export function yawFromEdge(a: Vec2, b: Vec2, inward = true): number {
  const n = edgeNormal(a, b);
  // Face into the room: flip normal.
  const nx = inward ? -n.x : n.x;
  const nz = inward ? -n.z : n.z;
  return (Math.atan2(nx, nz) * 180) / Math.PI;
}

export function pointInPolygon(p: Vec2, verts: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].x;
    const zi = verts[i].z;
    const xj = verts[j].x;
    const zj = verts[j].z;
    const intersect =
      zi > p.z !== zj > p.z &&
      p.x < ((xj - xi) * (p.z - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distPointToSegment(p: Vec2, a: Vec2, b: Vec2): {
  dist: number;
  t: number;
  closest: Vec2;
} {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1e-12;
  let t = ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2;
  t = Math.max(0, Math.min(1, t));
  const closest = { x: a.x + abx * t, z: a.z + abz * t };
  return {
    dist: Math.hypot(p.x - closest.x, p.z - closest.z),
    t,
    closest,
  };
}

export function nearestWall(
  p: Vec2,
  room: GalleryRoom,
): { edgeIndex: number; t: number; dist: number; a: Vec2; b: Vec2 } | null {
  const verts = roomWorldVertices(room);
  if (verts.length < 2) return null;
  let best: {
    edgeIndex: number;
    t: number;
    dist: number;
    a: Vec2;
    b: Vec2;
  } | null = null;
  for (let i = 0; i < verts.length; i++) {
    const [a, b] = edgePoints(verts, i);
    const hit = distPointToSegment(p, a, b);
    if (!best || hit.dist < best.dist) {
      best = { edgeIndex: i, t: hit.t, dist: hit.dist, a, b };
    }
  }
  return best;
}

export function findRoomAtPoint(
  p: Vec2,
  rooms: GalleryRoom[],
): GalleryRoom | null {
  for (let i = rooms.length - 1; i >= 0; i--) {
    const room = rooms[i];
    if (pointInPolygon(p, roomWorldVertices(room))) return room;
  }
  return null;
}

const SNAP_DIST = 0.7;
/** Edges must be nearly parallel / antiparallel before soft-snap or connection. */
const PARALLEL_DOT_MIN = 0.85;

type EdgeRef = { roomId: string; edgeIndex: number; a: Vec2; b: Vec2; mid: Vec2 };

function unitEdgeDir(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function edgesNearlyParallel(a: EdgeRef, b: EdgeRef): boolean {
  const da = unitEdgeDir(a.a, a.b);
  const db = unitEdgeDir(b.a, b.b);
  return Math.abs(da.x * db.x + da.z * db.z) >= PARALLEL_DOT_MIN;
}

/** World verts for fixed entrance footprint; portal edge faces +local Z. */
export function entranceWorldVertices(entrance: GalleryEntrancePose): Vec2[] {
  const hw = ENTRANCE_WIDTH / 2;
  const hd = ENTRANCE_DEPTH / 2;
  const t: RoomTransform = {
    x: entrance.x,
    z: entrance.z,
    rotation: entrance.rotation,
    scaleX: 1,
    scaleZ: 1,
  };
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ].map((v) => applyTransform(v, t));
}

export function entranceAsRoom(entrance?: GalleryEntrancePose | null): GalleryRoom {
  const pose = entrance ?? DEFAULT_ENTRANCE_POSE;
  return {
    id: ENTRANCE_ROOM_ID,
    shape: "square",
    transform: {
      x: pose.x,
      z: pose.z,
      rotation: pose.rotation,
      scaleX: 1,
      scaleZ: 1,
    },
    vertices: entranceWorldVertices(pose),
  };
}

/** Real rooms plus synthetic entrance for soft snap / connections. */
export function roomsWithEntrance(
  rooms: GalleryRoom[],
  entrance?: GalleryEntrancePose | null,
): GalleryRoom[] {
  return [...rooms, entranceAsRoom(entrance)];
}

function allEdges(rooms: GalleryRoom[]): EdgeRef[] {
  const out: EdgeRef[] = [];
  for (const room of rooms) {
    const verts = roomWorldVertices(room);
    if (room.id === ENTRANCE_ROOM_ID) {
      // Only the gallery-facing portal edge participates in snap / doorways.
      const [a, b] = edgePoints(verts, ENTRANCE_PORTAL_EDGE);
      out.push({
        roomId: room.id,
        edgeIndex: ENTRANCE_PORTAL_EDGE,
        a,
        b,
        mid: edgeMidpoint(a, b),
      });
      continue;
    }
    for (let i = 0; i < verts.length; i++) {
      const [a, b] = edgePoints(verts, i);
      out.push({
        roomId: room.id,
        edgeIndex: i,
        a,
        b,
        mid: edgeMidpoint(a, b),
      });
    }
  }
  return out;
}

/** Soft magnetic snap: if moving room's edge mid is near another room's edge mid, nudge transform. */
export function softSnapRoom(
  room: GalleryRoom,
  others: GalleryRoom[],
): { room: GalleryRoom; snappedTo: EdgeRef | null; ownEdge: number } {
  if (others.length === 0) return { room, snappedTo: null, ownEdge: -1 };

  const ownEdges = allEdges([room]);
  const otherEdges = allEdges(others);
  let bestDist = SNAP_DIST;
  let bestOwn = -1;
  let bestOther: EdgeRef | null = null;
  let dx = 0;
  let dz = 0;

  for (const oe of ownEdges) {
    for (const te of otherEdges) {
      if (!edgesNearlyParallel(oe, te)) continue;
      const d = Math.hypot(oe.mid.x - te.mid.x, oe.mid.z - te.mid.z);
      if (d < bestDist) {
        bestDist = d;
        bestOwn = oe.edgeIndex;
        bestOther = te;
        dx = te.mid.x - oe.mid.x;
        dz = te.mid.z - oe.mid.z;
      }
    }
  }

  if (!bestOther || bestOwn < 0) {
    return { room, snappedTo: null, ownEdge: -1 };
  }

  return {
    room: {
      ...room,
      transform: {
        ...room.transform,
        x: room.transform.x + dx,
        z: room.transform.z + dz,
      },
      vertices: undefined,
    },
    snappedTo: bestOther,
    ownEdge: bestOwn,
  };
}

/** Soft-snap entrance pose translation against room edge mids (portal only). */
export function softSnapEntrance(
  entrance: GalleryEntrancePose,
  rooms: GalleryRoom[],
): GalleryEntrancePose {
  if (rooms.length === 0) return entrance;
  const synthetic = entranceAsRoom(entrance);
  const snapped = softSnapRoom(synthetic, rooms);
  if (!snapped.snappedTo) return entrance;
  return {
    ...entrance,
    x: snapped.room.transform.x,
    z: snapped.room.transform.z,
  };
}

export function recomputeConnections(rooms: GalleryRoom[]): RoomConnection[] {
  const edges = allEdges(rooms);
  const connections: RoomConnection[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const a = edges[i];
      const b = edges[j];
      if (a.roomId === b.roomId) continue;
      if (!edgesNearlyParallel(a, b)) continue;
      const d = Math.hypot(a.mid.x - b.mid.x, a.mid.z - b.mid.z);
      if (d > SNAP_DIST) continue;
      const key = [a.roomId, b.roomId].sort().join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      const toEntrance =
        a.roomId === ENTRANCE_ROOM_ID || b.roomId === ENTRANCE_ROOM_ID;
      const width = toEntrance
        ? ENTRANCE_WIDTH
        : Math.min(
            1.4,
            edgeLength(a.a, a.b) * 0.35,
            edgeLength(b.a, b.b) * 0.35,
          );
      connections.push({
        roomA: a.roomId,
        roomB: b.roomId,
        edgeA: a.edgeIndex,
        edgeB: b.edgeIndex,
        doorwayWidth: toEntrance ? ENTRANCE_WIDTH : Math.max(0.9, width),
      });
    }
  }
  return connections;
}

const PAINTING_OCCUPANCY = 0.22;
const SCULPTURE_OCCUPANCY = 0.85;

export function placementConflicts(
  candidate: ArtworkPlacement,
  layout: GalleryLayout,
  ignoreArtworkId?: string,
): boolean {
  const others = layout.placements.filter(
    (p) => p.artworkId !== ignoreArtworkId && p.artworkId !== candidate.artworkId,
  );

  if (candidate.kind === "painting") {
    if (
      candidate.wallEdgeIndex == null ||
      candidate.tAlongEdge == null ||
      !candidate.roomId
    ) {
      return true;
    }
    for (const o of others) {
      if (o.kind !== "painting") continue;
      if (o.roomId !== candidate.roomId) continue;
      if (o.wallEdgeIndex !== candidate.wallEdgeIndex) continue;
      if (Math.abs((o.tAlongEdge ?? 0) - candidate.tAlongEdge) < PAINTING_OCCUPANCY) {
        return true;
      }
    }
    return false;
  }

  // Sculpture floor occupancy
  if (candidate.floorX == null || candidate.floorZ == null || !candidate.roomId) {
    return true;
  }
  const room = layout.rooms.find((r) => r.id === candidate.roomId);
  if (!room) return true;
  if (
    !pointInPolygon(
      { x: candidate.floorX, z: candidate.floorZ },
      roomWorldVertices(room),
    )
  ) {
    return true;
  }
  for (const o of others) {
    if (o.kind !== "sculpture") continue;
    if (o.floorX == null || o.floorZ == null) continue;
    const d = Math.hypot(o.floorX - candidate.floorX, o.floorZ - candidate.floorZ);
    if (d < SCULPTURE_OCCUPANCY) return true;
  }
  return false;
}

export function defaultRoomTransform(
  shape: RoomShape,
  index: number,
): RoomTransform {
  const base = shape === "square" ? 3.2 : 2.8;
  return {
    x: (index % 3) * 6.5,
    z: Math.floor(index / 3) * 6.5 + 4,
    rotation: 0,
    scaleX: base,
    scaleZ: base,
  };
}
