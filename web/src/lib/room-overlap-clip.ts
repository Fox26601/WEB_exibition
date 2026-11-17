import type { GalleryLayout, GalleryRoom } from "./catalog-types";
import { normalizeLayout } from "./catalog-types";
import {
  edgePoints,
  pointInPolygon,
  roomWorldVertices,
  type Vec2,
} from "./layout-geometry";

const EPS = 1e-6;
const MIN_SPAN = 0.08;

export type WallSpan = { t0: number; t1: number };

export type OverlapRoom = {
  id: string;
  verts: Vec2[];
};

function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}

function segSegIntersection(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
): { t: number; u: number } | null {
  const dx1 = b.x - a.x;
  const dz1 = b.z - a.z;
  const dx2 = d.x - c.x;
  const dz2 = d.z - c.z;
  const cross = dx1 * dz2 - dz1 * dx2;
  if (Math.abs(cross) < EPS) return null;
  const qdx = c.x - a.x;
  const qdz = c.z - a.z;
  const t = (qdx * dz2 - qdz * dx2) / cross;
  const u = (qdx * dz1 - qdz * dx1) / cross;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return {
    t: Math.max(0, Math.min(1, t)),
    u: Math.max(0, Math.min(1, u)),
  };
}

function splitsOnEdge(rooms: OverlapRoom[], roomId: string, edgeIndex: number): number[] {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return [0, 1];
  const [a, b] = edgePoints(room.verts, edgeIndex);
  const ts = new Set<number>([0, 1]);

  for (const other of rooms) {
    if (other.id === roomId) continue;
    for (let j = 0; j < other.verts.length; j++) {
      const [c, d] = edgePoints(other.verts, j);
      const hit = segSegIntersection(a, b, c, d);
      if (hit) ts.add(hit.t);
    }
  }

  return [...ts].sort((x, y) => x - y);
}

function midpointInsideOtherRoom(
  rooms: OverlapRoom[],
  ownerId: string,
  a: Vec2,
  b: Vec2,
  t0: number,
  t1: number,
): boolean {
  const mid = lerp2(a, b, (t0 + t1) * 0.5);
  for (const other of rooms) {
    if (other.id === ownerId) continue;
    if (pointInPolygon(mid, other.verts)) return true;
  }
  return false;
}

/** Exterior wall intervals along one room edge (omit spans inside other rooms). */
export function wallSpansForEdge(
  rooms: OverlapRoom[],
  roomId: string,
  edgeIndex: number,
): WallSpan[] {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const [a, b] = edgePoints(room.verts, edgeIndex);
  const splits = splitsOnEdge(rooms, roomId, edgeIndex);
  const spans: WallSpan[] = [];

  for (let i = 0; i < splits.length - 1; i++) {
    const t0 = splits[i];
    const t1 = splits[i + 1];
    if (t1 - t0 < MIN_SPAN / Math.hypot(b.x - a.x, b.z - a.z)) continue;
    if (midpointInsideOtherRoom(rooms, roomId, a, b, t0, t1)) continue;
    spans.push({ t0, t1 });
  }
  return spans;
}

export function wallSpansForRoom(
  rooms: OverlapRoom[],
  roomId: string,
): WallSpan[][] {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const out: WallSpan[][] = [];
  for (let i = 0; i < room.verts.length; i++) {
    out.push(wallSpansForEdge(rooms, roomId, i));
  }
  return out;
}

export function layoutOverlapRooms(layout: GalleryLayout): OverlapRoom[] {
  const normalized = normalizeLayout(layout);
  return normalized.rooms.map((room) => ({
    id: room.id,
    verts: roomWorldVertices(room),
  }));
}

/**
 * Keep floor triangles whose centroid lies inside the owner's polygon.
 * Overlapping rooms do not clip each other's floor (matches admin 2D room fill).
 */
export function shouldKeepFloorTriangle(
  rooms: OverlapRoom[],
  ownerId: string,
  centroid: Vec2,
): boolean {
  const owner = rooms.find((r) => r.id === ownerId);
  if (!owner || owner.verts.length < 3) return true;
  return pointInPolygon(centroid, owner.verts);
}