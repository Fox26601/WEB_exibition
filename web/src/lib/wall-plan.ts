/**
 * Domain wall plan: catalog → visible wall segments (editor parity).
 * Runtime meshes are built only from this plan (Three adapter).
 */
import type { ArtworkPlacement, GalleryLayout } from "./catalog-types";
import { ENTRANCE_ROOM_ID, normalizeLayout } from "./catalog-types";
import {
  distPointToSegment,
  edgePoints,
  ENTRANCE_ARCH_WIDTH,
  pointInPolygon,
  roomWorldVertices,
  type Vec2,
} from "./layout-geometry";
import {
  edgeFullyInsideOverlap,
  layoutOverlapRooms,
  wallSpansForEdge,
  type OverlapRoom,
  type WallSpan,
} from "./room-overlap-clip";
import {
  DEFAULT_DOOR_WIDTH,
  WALL_CORNER_JOIN,
} from "./gallery-three/constants";

export type WallSegmentKind = "exterior" | "snap_surface";

export type WallSegmentPlan = {
  roomId: string;
  edgeIndex: number;
  t0: number;
  t1: number;
  doorwayWidth: number;
  kind: WallSegmentKind;
  /**
   * Half-thickness join pad at t0 when that end is a polygon vertex.
   * Mid-span / doorway-open ends stay 0 (flush).
   */
  join0: number;
  /** Join pad at t1 (see join0). */
  join1: number;
};

export type LayoutWallPlan = {
  segments: WallSegmentPlan[];
};

const EPS = 1e-6;

/** Pad along edge (fraction of length) so paintings have wall mesh under editor dots. */
const SNAP_SURFACE_PAD_MIN = 0.38;
const SNAP_SURFACE_PAD_EDGE = 1.1;

function findDoorwayWidth(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
): number {
  for (const c of layout.connections) {
    let partner: string | null = null;
    if (c.roomA === roomId && c.edgeA === edgeIndex) partner = c.roomB;
    else if (c.roomB === roomId && c.edgeB === edgeIndex) partner = c.roomA;
    if (!partner) continue;
    const toEntrance =
      partner === ENTRANCE_ROOM_ID || roomId === ENTRANCE_ROOM_ID;
    const floor = toEntrance ? ENTRANCE_ARCH_WIDTH : DEFAULT_DOOR_WIDTH;
    return Math.max(floor, c.doorwayWidth ?? 0);
  }
  return 0;
}

/**
 * On a room↔room doorway, only the lexicographically lower roomId owns the wall
 * shell (matches overlap coplanar dedup). Higher partner keeps snap_surface pads only.
 */
function deferSharedDoorwayShell(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
): boolean {
  for (const c of layout.connections) {
    let partner: string | null = null;
    if (c.roomA === roomId && c.edgeA === edgeIndex) partner = c.roomB;
    else if (c.roomB === roomId && c.edgeB === edgeIndex) partner = c.roomA;
    if (!partner || partner === ENTRANCE_ROOM_ID) continue;
    return partner < roomId;
  }
  return false;
}

function isEntranceEdgeFallback(a: Vec2, b: Vec2, verts: Vec2[]): boolean {
  let minZ = Infinity;
  for (const v of verts) minZ = Math.min(minZ, v.z);
  const midZ = (a.z + b.z) * 0.5;
  if (midZ > minZ + 0.35) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.abs(dx) >= Math.abs(dz) * 0.6;
}

/** Overlap clip left no spans; build if part of edge is exterior-facing. */
function edgeNeedsExteriorShell(
  roomId: string,
  a: Vec2,
  b: Vec2,
  overlapRooms: ReturnType<typeof layoutOverlapRooms>,
): boolean {
  for (const t of [0.12, 0.5, 0.88]) {
    const p = {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
    };
    let inOtherInterior = false;
    for (const other of overlapRooms) {
      if (other.id === roomId) continue;
      if (!pointInPolygon(p, other.verts)) continue;
      const nearBoundary = other.verts.some((_, j) => {
        const c = other.verts[j];
        const d = other.verts[(j + 1) % other.verts.length];
        return distPointToSegment(p, c, d).dist < 0.06;
      });
      if (!nearBoundary) {
        inOtherInterior = true;
        break;
      }
    }
    if (!inOtherInterior) return true;
  }
  return false;
}

/**
 * True when this edge runs along another room's boundary (shared wall).
 * Clip correctly returns [] for the higher roomId; restoring a full shell here
 * doubles the doorway / seams and looks "crooked".
 */
function edgeLooksSharedCoplanar(
  overlapRooms: OverlapRoom[],
  roomId: string,
  a: Vec2,
  b: Vec2,
): boolean {
  const samples = [0.2, 0.5, 0.8];
  for (const other of overlapRooms) {
    if (other.id === roomId) continue;
    let hits = 0;
    for (const t of samples) {
      const p = {
        x: a.x + (b.x - a.x) * t,
        z: a.z + (b.z - a.z) * t,
      };
      const nearBoundary = other.verts.some((_, j) => {
        const c = other.verts[j];
        const d = other.verts[(j + 1) % other.verts.length];
        return distPointToSegment(p, c, d).dist < 0.12;
      });
      if (nearBoundary) hits += 1;
    }
    if (hits >= 2) return true;
  }
  return false;
}

function mergeSpans(spans: WallSpan[]): WallSpan[] {
  const sorted = [...spans].sort((x, y) => x.t0 - y.t0);
  const merged: WallSpan[] = [];
  for (const s of sorted) {
    const last = merged[merged.length - 1];
    if (last && s.t0 <= last.t1 + EPS) {
      last.t1 = Math.max(last.t1, s.t1);
    } else {
      merged.push({ t0: s.t0, t1: s.t1 });
    }
  }
  return merged;
}

function addSnapSurfaceSpans(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
  spans: WallSpan[],
  edgeLen: number,
): { spans: WallSpan[]; kinds: Map<string, WallSegmentKind> } {
  const placements = layout.placements.filter(
    (p): p is ArtworkPlacement & { tAlongEdge: number } =>
      p.kind === "painting" &&
      p.roomId === roomId &&
      p.wallEdgeIndex === edgeIndex &&
      p.tAlongEdge != null,
  );
  const kinds = new Map<string, WallSegmentKind>();
  const key = (s: WallSpan) => `${s.t0.toFixed(6)}:${s.t1.toFixed(6)}`;

  let out = spans.map((s) => {
    kinds.set(key(s), "exterior");
    return { ...s };
  });

  if (placements.length === 0) {
    return { spans: mergeSpans(out), kinds };
  }

  const pad = Math.min(SNAP_SURFACE_PAD_MIN, SNAP_SURFACE_PAD_EDGE / (edgeLen || 1));
  for (const p of placements) {
    const t = Math.max(0, Math.min(1, p.tAlongEdge));
    if (out.some((s) => t >= s.t0 - EPS && t <= s.t1 + EPS)) continue;
    const snap: WallSpan = {
      t0: Math.max(0, t - pad),
      t1: Math.min(1, t + pad),
    };
    kinds.set(key(snap), "snap_surface");
    out.push(snap);
  }

  out = mergeSpans(out);
  for (const s of out) {
    if (!kinds.has(key(s))) kinds.set(key(s), "exterior");
  }
  return { spans: out, kinds };
}

function doorwayForSpan(
  fullDoorway: number,
  span: WallSpan,
): number {
  if (fullDoorway <= 0.01) return 0;
  if (span.t0 <= 0.5 + EPS && span.t1 >= 0.5 - EPS) return fullDoorway;
  return 0;
}

/** Spans along one edge from a built plan (for editor parity checks). */
export function wallPlanSpansForEdge(
  plan: LayoutWallPlan,
  roomId: string,
  edgeIndex: number,
): WallSpan[] {
  return plan.segments
    .filter((s) => s.roomId === roomId && s.edgeIndex === edgeIndex)
    .map((s) => ({ t0: s.t0, t1: s.t1 }));
}

export function buildLayoutWallPlan(layoutInput: GalleryLayout): LayoutWallPlan {
  const layout = normalizeLayout(layoutInput);
  const overlapRooms = layoutOverlapRooms(layout);
  const multiOverlap = overlapRooms.length > 1;
  const segments: WallSegmentPlan[] = [];

  for (const room of layout.rooms) {
    if (!room?.id) continue;
    const verts = roomWorldVertices(room);
    if (verts.length < 3) continue;

    for (let edgeIndex = 0; edgeIndex < verts.length; edgeIndex++) {
      const [a, b] = edgePoints(verts, edgeIndex);
      const edgeLen = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      let doorway = findDoorwayWidth(layout, room.id, edgeIndex);
      if (doorway <= 0.01 && isEntranceEdgeFallback(a, b, verts)) {
        doorway = DEFAULT_DOOR_WIDTH;
      }

      let exteriorSpans: WallSpan[];
      if (deferSharedDoorwayShell(layout, room.id, edgeIndex)) {
        exteriorSpans = [];
      } else if (multiOverlap) {
        exteriorSpans = wallSpansForEdge(overlapRooms, room.id, edgeIndex);
        // Empty clip means shared/coplanar or fully interior — do NOT restore a
        // full {0,1} shell (that reintroduced double walls / crooked seams).
        // Paintings still get snap_surface pads via addSnapSurfaceSpans.
        if (
          exteriorSpans.length === 0 &&
          edgeNeedsExteriorShell(room.id, a, b, overlapRooms) &&
          !edgeFullyInsideOverlap(overlapRooms, room.id, a, b) &&
          !edgeLooksSharedCoplanar(overlapRooms, room.id, a, b)
        ) {
          exteriorSpans = [{ t0: 0, t1: 1 }];
        }
      } else {
        exteriorSpans = [{ t0: 0, t1: 1 }];
      }

      const { spans, kinds } = addSnapSurfaceSpans(
        layout,
        room.id,
        edgeIndex,
        exteriorSpans,
        edgeLen,
      );

      for (const span of spans) {
        const kindKey = `${span.t0.toFixed(6)}:${span.t1.toFixed(6)}`;
        const kind = kinds.get(kindKey) ?? "exterior";
        const spanLen =
          edgeLen * (span.t1 - span.t0);
        let spanDoor = doorwayForSpan(doorway, span);
        if (spanDoor > 0.01) {
          spanDoor = Math.min(spanDoor, Math.max(0, spanLen - 0.2));
        }
        // Only polygon vertices get a T/2 join pad — mid-clip ends stay flush.
        const join0 = span.t0 <= EPS ? WALL_CORNER_JOIN : 0;
        const join1 = span.t1 >= 1 - EPS ? WALL_CORNER_JOIN : 0;
        segments.push({
          roomId: room.id,
          edgeIndex,
          t0: span.t0,
          t1: span.t1,
          doorwayWidth: spanDoor,
          kind,
          join0,
          join1,
        });
      }
    }
  }

  return { segments };
}

export function placementTCoveredByPlan(
  plan: LayoutWallPlan,
  roomId: string,
  edgeIndex: number,
  t: number,
): boolean {
  return wallPlanSpansForEdge(plan, roomId, edgeIndex).some(
    (s) => t >= s.t0 - EPS && t <= s.t1 + EPS,
  );
}