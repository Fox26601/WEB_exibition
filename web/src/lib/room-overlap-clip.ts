import type {
  ArtworkPlacement,
  GalleryLayout,
  GalleryRoom,
} from "./catalog-types";
import { normalizeLayout } from "./catalog-types";
import {
  edgePoints,
  pointInPolygon,
  roomWorldVertices,
  type Vec2,
} from "./layout-geometry";

const EPS = 1e-6;
const MIN_SPAN = 0.12;
const BOUNDARY_TOL = 0.035;

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
    if (!pointInPolygon(mid, other.verts)) continue;
    if (pointOnPolygonBoundary(mid, other.verts)) continue;
    return true;
  }
  return false;
}

function pointOnPolygonBoundary(p: Vec2, verts: Vec2[]): boolean {
  for (let i = 0; i < verts.length; i++) {
    const c = verts[i];
    const d = verts[(i + 1) % verts.length];
    const cdx = d.x - c.x;
    const cdz = d.z - c.z;
    const cdLen = Math.hypot(cdx, cdz);
    if (cdLen < EPS) continue;
    const cdDir = { x: cdx / cdLen, z: cdz / cdLen };
    if (pointOnCollinearEdge(p, cdDir, c, d)) return true;
  }
  return false;
}

function pointOnCollinearEdge(p: Vec2, edgeDir: Vec2, c: Vec2, d: Vec2): boolean {
  const cdx = d.x - c.x;
  const cdz = d.z - c.z;
  const cdLen = Math.hypot(cdx, cdz);
  if (cdLen < EPS) return false;
  const cdDir = { x: cdx / cdLen, z: cdz / cdLen };
  const cross = edgeDir.x * cdDir.z - edgeDir.z * cdDir.x;
  if (Math.abs(cross) > 0.02) return false;
  const toPx = p.x - c.x;
  const toPz = p.z - c.z;
  const perp = Math.abs(toPx * cdDir.z - toPz * cdDir.x);
  if (perp > BOUNDARY_TOL) return false;
  const u = toPx * cdDir.x + toPz * cdDir.z;
  return u >= -BOUNDARY_TOL && u <= cdLen + BOUNDARY_TOL;
}

function isDuplicateCoplanarWall(
  rooms: OverlapRoom[],
  roomId: string,
  a: Vec2,
  b: Vec2,
  t0: number,
  t1: number,
): boolean {
  const mid = lerp2(a, b, (t0 + t1) * 0.5);
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const abLen = Math.hypot(abx, abz);
  if (abLen < EPS) return false;
  const abDir = { x: abx / abLen, z: abz / abLen };

  for (const other of rooms) {
    if (other.id === roomId) continue;
    if (other.id >= roomId) continue;
    if (pointInPolygon(mid, other.verts)) continue;
    for (let j = 0; j < other.verts.length; j++) {
      const c = other.verts[j];
      const d = other.verts[(j + 1) % other.verts.length];
      if (pointOnCollinearEdge(mid, abDir, c, d)) return true;
    }
  }
  return false;
}

/** Exterior wall intervals along one room edge (omit spans inside other rooms). */
function mergePlacementPads(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
  spans: WallSpan[],
  edgeLen: number,
): WallSpan[] {
  const placements = layout.placements.filter(
    (p): p is ArtworkPlacement & { tAlongEdge: number } =>
      p.kind === "painting" &&
      p.roomId === roomId &&
      p.wallEdgeIndex === edgeIndex &&
      p.tAlongEdge != null,
  );
  if (placements.length === 0) return spans;
  const pad = Math.min(0.38, 1.1 / (edgeLen || 1));
  const out: WallSpan[] = spans.map((s) => ({ ...s }));
  for (const p of placements) {
    const t = Math.max(0, Math.min(1, p.tAlongEdge));
    if (out.some((s) => t >= s.t0 - 1e-6 && t <= s.t1 + 1e-6)) continue;
    out.push({ t0: Math.max(0, t - pad), t1: Math.min(1, t + pad) });
  }
  out.sort((x, y) => x.t0 - y.t0);
  const merged: WallSpan[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && s.t0 <= last.t1 + 1e-6) {
      last.t1 = Math.max(last.t1, s.t1);
    } else {
      merged.push({ ...s });
    }
  }
  return merged.length ? merged : out;
}

export function wallSpansForEdgeWithPlacements(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
): WallSpan[] {
  const overlap = layoutOverlapRooms(layout);
  const room = overlap.find((r) => r.id === roomId);
  if (!room) return [];
  const [a, b] = edgePoints(room.verts, edgeIndex);
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  const spans = wallSpansForEdge(overlap, roomId, edgeIndex);
  return mergePlacementPads(layout, roomId, edgeIndex, spans, len);
}

/** True when the whole edge sits in another room's interior (admin still draws the outline). */
export function edgeFullyInsideOverlap(
  rooms: OverlapRoom[],
  roomId: string,
  a: Vec2,
  b: Vec2,
): boolean {
  for (const t of [0.2, 0.5, 0.8]) {
    const p = lerp2(a, b, t);
    let covered = false;
    for (const other of rooms) {
      if (other.id === roomId) continue;
      if (!pointInPolygon(p, other.verts)) continue;
      if (pointOnPolygonBoundary(p, other.verts)) continue;
      covered = true;
      break;
    }
    if (!covered) return false;
  }
  return true;
}

/** Interior split points where room edges meet (overlap T-junctions). */
export function splitPointsOnEdge(
  rooms: OverlapRoom[],
  roomId: string,
  edgeIndex: number,
): Vec2[] {
  const room = rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const [a, b] = edgePoints(room.verts, edgeIndex);
  const splits = splitsOnEdge(rooms, roomId, edgeIndex);
  const pts: Vec2[] = [];
  for (const t of splits) {
    if (t <= 1e-6 || t >= 1 - 1e-6) continue;
    pts.push(lerp2(a, b, t));
  }
  return pts;
}

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
    if (isDuplicateCoplanarWall(rooms, roomId, a, b, t0, t1)) continue;
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