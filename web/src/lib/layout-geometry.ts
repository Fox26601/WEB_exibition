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
import { DEFAULT_DOOR_WIDTH } from "./gallery-three/constants";

export type Vec2 = { x: number; z: number };

/**
 * Shared foyer footprint (plan schematic === 3D corridor).
 * Depth was previously 3 on plan vs 6 in Three — unified to walkable depth.
 */
export const ENTRANCE_WIDTH = 2.4;
export const ENTRANCE_DEPTH = 6.0;
/** Portal edge index for entranceWorldVertices (+local Z side). */
export const ENTRANCE_PORTAL_EDGE = 2;

/** max(width, depth) — gallery defaults size relative to this. */
export const FOYER_REF_SPAN = Math.max(ENTRANCE_WIDTH, ENTRANCE_DEPTH);
/** New gallery rooms target ~2× foyer span on plan and in 3D. */
export const GALLERY_TO_FOYER_SPAN_RATIO = 2.0;
export const TARGET_GALLERY_SPAN = FOYER_REF_SPAN * GALLERY_TO_FOYER_SPAN_RATIO;

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

/** Inward wall normal (centroid picks the into-room side). */
export function roomCentroid(verts: Vec2[]): Vec2 {
  let x = 0;
  let z = 0;
  for (const v of verts) {
    x += v.x;
    z += v.z;
  }
  const n = verts.length || 1;
  return { x: x / n, z: z / n };
}

export function inwardNormal(a: Vec2, b: Vec2, centroid: Vec2): Vec2 {
  const n = edgeNormal(a, b);
  const mx = (a.x + b.x) / 2;
  const mz = (a.z + b.z) / 2;
  let nx = n.x;
  let nz = n.z;
  const tcx = centroid.x - mx;
  const tcz = centroid.z - mz;
  if (nx * tcx + nz * tcz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: nx, z: nz };
}

export function yawFromInward(inward: Vec2): number {
  return (Math.atan2(inward.x, inward.z) * 180) / Math.PI;
}

export function yawFromEdge(
  a: Vec2,
  b: Vec2,
  inward = true,
  centroid?: Vec2,
): number {
  if (inward && centroid) {
    return yawFromInward(inwardNormal(a, b, centroid));
  }
  const n = edgeNormal(a, b);
  const nx = inward ? -n.x : n.x;
  const nz = inward ? -n.z : n.z;
  return yawFromInward({ x: nx, z: nz });
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
/** Larger capture when square aligns to triangle / hexagon on drag-release. */
const SNAP_DIST_POLY_ASSIST = 3.2;
const POLY_ASSIST_MAX_CENTER_SHIFT = 4.5;
/** Edges must be nearly parallel / antiparallel before soft-snap or connection. */
const PARALLEL_DOT_MIN = 0.85;
const PARALLEL_DOT_POLY = 0.995;

export type SoftSnapRoomOptions = {
  /** Keep transform.rotation; translation-only snap (room tap). */
  lockRotation?: boolean;
};

type EdgeRef = { roomId: string; edgeIndex: number; a: Vec2; b: Vec2; mid: Vec2 };

function unitEdgeDir(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

function edgesNearlyParallel(
  a: EdgeRef,
  b: EdgeRef,
  dotMin = PARALLEL_DOT_MIN,
): boolean {
  const da = unitEdgeDir(a.a, a.b);
  const db = unitEdgeDir(b.a, b.b);
  return Math.abs(da.x * db.x + da.z * db.z) >= dotMin;
}

function edgeAzimuthDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
}

function normDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Plan-mode rotate step: square +45°, other shapes +90°. */
export function nextRoomRotation(
  shape: RoomShape,
  currentRotation: number,
): number {
  const step = shape === "square" ? 45 : 90;
  return ((currentRotation || 0) + step) % 360;
}

/** Plan-mode entrance rotate step: always +90°. */
export function nextEntranceRotation(currentRotation: number): number {
  return ((currentRotation || 0) + 90) % 360;
}

/** Pick square rotation so one edge is parallel to target edge azimuth. */
export function squareRotationParallelToEdge(
  currentR: number,
  targetAzimuthDeg: number,
): number {
  const theta = normDeg(targetAzimuthDeg);
  const candidates = [theta, theta - 90];
  const cur = normDeg(currentR);
  let best = cur;
  let bestDelta = 999;
  for (const raw of candidates) {
    const r = normDeg(raw);
    let delta = Math.abs(r - cur);
    if (delta > 180) delta = 360 - delta;
    if (delta < bestDelta) {
      bestDelta = delta;
      best = r;
    }
  }
  return best;
}

function centerShiftSq(room: GalleryRoom, next: GalleryRoom): number {
  const dx = next.transform.x - room.transform.x;
  const dz = next.transform.z - room.transform.z;
  return dx * dx + dz * dz;
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

function snapAlignmentScore(
  room: GalleryRoom,
  result: { room: GalleryRoom; snappedTo: EdgeRef | null; ownEdge: number },
): number {
  if (!result.snappedTo || result.ownEdge < 0) return SNAP_DIST + 1;
  const ownEdges = allEdges([result.room]);
  const oe = ownEdges.find((e) => e.edgeIndex === result.ownEdge);
  if (!oe) return SNAP_DIST + 1;
  return Math.hypot(
    oe.mid.x - result.snappedTo.mid.x,
    oe.mid.z - result.snappedTo.mid.z,
  );
}

function roomById(rooms: GalleryRoom[], id: string): GalleryRoom | undefined {
  return rooms.find((r) => r.id === id);
}

function isPolygonSnapTarget(room: GalleryRoom | undefined): boolean {
  return room?.shape === "triangle" || room?.shape === "hexagon";
}

type TranslateSnapOpts = {
  maxDist?: number;
  parallelDotMin?: number;
};

/** Translation-only soft snap at the room's current rotation. */
export function softSnapRoomTranslate(
  room: GalleryRoom,
  others: GalleryRoom[],
  opts?: TranslateSnapOpts,
): { room: GalleryRoom; snappedTo: EdgeRef | null; ownEdge: number } {
  if (others.length === 0) return { room, snappedTo: null, ownEdge: -1 };

  const maxDist = opts?.maxDist ?? SNAP_DIST;
  const dotMin = opts?.parallelDotMin ?? PARALLEL_DOT_MIN;

  const ownEdges = allEdges([room]);
  const otherEdges = allEdges(others);
  let bestDist = maxDist;
  let bestOwn = -1;
  let bestOther: EdgeRef | null = null;
  let dx = 0;
  let dz = 0;

  for (const oe of ownEdges) {
    for (const te of otherEdges) {
      if (!edgesNearlyParallel(oe, te, dotMin)) continue;
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

function squarePolyEdgeAssist(
  room: GalleryRoom,
  others: GalleryRoom[],
): { room: GalleryRoom; snappedTo: EdgeRef | null; ownEdge: number } | null {
  const polyRooms = others.filter(
    (o) => o.shape === "triangle" || o.shape === "hexagon",
  );
  if (polyRooms.length === 0) return null;

  const polyEdges = allEdges(polyRooms);
  const baseR = room.transform.rotation ?? 0;
  let best: { room: GalleryRoom; snappedTo: EdgeRef | null; ownEdge: number } | null =
    null;
  let bestScore = SNAP_DIST_POLY_ASSIST + 1;

  for (const te of polyEdges) {
    const targetRoom = roomById(others, te.roomId);
    if (!isPolygonSnapTarget(targetRoom)) continue;
    const theta = edgeAzimuthDeg(te.a, te.b);
    // Same parallel candidates as squareRotationParallelToEdge (θ and θ−90).
    const parallelRots = [
      squareRotationParallelToEdge(baseR, theta),
      normDeg(theta),
      normDeg(theta - 90),
    ];
    const seenRot = new Set<number>();
    for (const rot of parallelRots) {
      const r = normDeg(rot);
      if (seenRot.has(r)) continue;
      seenRot.add(r);
      const candidate: GalleryRoom = {
        ...room,
        transform: { ...room.transform, rotation: r },
        vertices: undefined,
      };
      const snapped = softSnapRoomTranslate(candidate, others, {
        maxDist: SNAP_DIST_POLY_ASSIST,
        parallelDotMin: PARALLEL_DOT_POLY,
      });
      if (!snapped.snappedTo) continue;
      const snapTarget = roomById(others, snapped.snappedTo.roomId);
      if (!isPolygonSnapTarget(snapTarget)) continue;
      if (
        centerShiftSq(room, snapped.room) >
        POLY_ASSIST_MAX_CENTER_SHIFT * POLY_ASSIST_MAX_CENTER_SHIFT
      ) {
        continue;
      }
      const score = snapAlignmentScore(candidate, snapped);
      if (score < bestScore) {
        bestScore = score;
        best = snapped;
      }
    }
  }

  if (best) return best;

  const baseRot = normDeg(baseR);
  for (let k = 1; k < 8; k++) {
    const rot = normDeg(baseRot + k * 45);
    const candidate: GalleryRoom = {
      ...room,
      transform: { ...room.transform, rotation: rot },
      vertices: undefined,
    };
    const snapped = softSnapRoomTranslate(candidate, others, {
      maxDist: SNAP_DIST_POLY_ASSIST,
      parallelDotMin: PARALLEL_DOT_POLY,
    });
    if (!snapped.snappedTo) continue;
    const target = roomById(others, snapped.snappedTo.roomId);
    if (!isPolygonSnapTarget(target)) continue;
    const score = snapAlignmentScore(candidate, snapped);
    if (score < bestScore) {
      bestScore = score;
      best = snapped;
    }
  }

  return best;
}

/**
 * Soft magnetic snap: nudge transform so parallel edges meet.
 * Square near triangles / hexagons: on drag, align rotation to target edge
 * azimuth (60°, 30°, …), not fuzzy 45°↔60°.
 */
export function softSnapRoom(
  room: GalleryRoom,
  others: GalleryRoom[],
  opts?: SoftSnapRoomOptions,
): { room: GalleryRoom; snappedTo: EdgeRef | null; ownEdge: number } {
  if (opts?.lockRotation) {
    return softSnapRoomTranslate(room, others);
  }

  const primary = softSnapRoomTranslate(room, others);
  const othersHavePoly =
    room.shape === "square" &&
    others.some((o) => o.shape === "triangle" || o.shape === "hexagon");
  if (!othersHavePoly) return primary;

  if (primary.snappedTo?.roomId === ENTRANCE_ROOM_ID) return primary;

  let best = primary;
  let bestScore = snapAlignmentScore(room, primary);

  const polyAssist = squarePolyEdgeAssist(room, others);
  if (polyAssist?.snappedTo) {
    const score = snapAlignmentScore(room, polyAssist);
    if (score < bestScore) {
      best = polyAssist;
    }
  }

  return best;
}

function portalEdgeRef(entrance: GalleryEntrancePose): EdgeRef {
  const verts = entranceWorldVertices(entrance);
  const [a, b] = edgePoints(verts, ENTRANCE_PORTAL_EDGE);
  return {
    roomId: ENTRANCE_ROOM_ID,
    edgeIndex: ENTRANCE_PORTAL_EDGE,
    a,
    b,
    mid: edgeMidpoint(a, b),
  };
}

/** Rotate + nudge entrance so the portal edge aligns with a target room edge. */
export function rotateEntranceToAlignPortal(
  entrance: GalleryEntrancePose,
  target: Pick<EdgeRef, "a" | "b">,
): GalleryEntrancePose {
  const targetRef: EdgeRef = {
    roomId: "",
    edgeIndex: 0,
    a: target.a,
    b: target.b,
    mid: edgeMidpoint(target.a, target.b),
  };
  let best: GalleryEntrancePose | null = null;
  let bestDist = SNAP_DIST + 1;

  for (let k = 0; k < 4; k++) {
    const rot = (entrance.rotation + k * 90) % 360;
    const cand: GalleryEntrancePose = { ...entrance, rotation: rot };
    const portal = portalEdgeRef(cand);
    if (!edgesNearlyParallel(portal, targetRef)) continue;
    const dx = targetRef.mid.x - portal.mid.x;
    const dz = targetRef.mid.z - portal.mid.z;
    const aligned: GalleryEntrancePose = {
      x: cand.x + dx,
      z: cand.z + dz,
      rotation: rot,
    };
    const d = Math.hypot(dx, dz);
    if (d < bestDist) {
      bestDist = d;
      best = aligned;
    }
  }
  return best ?? entrance;
}

/** Soft-snap entrance: smart rotation (0/90/180/270) + translation to nearest room edge. */
export function softSnapEntrance(
  entrance: GalleryEntrancePose,
  rooms: GalleryRoom[],
): GalleryEntrancePose {
  if (rooms.length === 0) return entrance;

  let best: GalleryEntrancePose | null = null;
  let bestMidDist = SNAP_DIST + 1;

  for (let k = 0; k < 4; k++) {
    const rot = (entrance.rotation + k * 90) % 360;
    const candidate: GalleryEntrancePose = { ...entrance, rotation: rot };
    const synthetic = entranceAsRoom(candidate);
    const snapped = softSnapRoom(synthetic, rooms);
    if (!snapped.snappedTo) continue;
    const portal = portalEdgeRef({
      x: snapped.room.transform.x,
      z: snapped.room.transform.z,
      rotation: rot,
    });
    const d = Math.hypot(
      portal.mid.x - snapped.snappedTo.mid.x,
      portal.mid.z - snapped.snappedTo.mid.z,
    );
    if (d < bestMidDist) {
      bestMidDist = d;
      best = {
        x: snapped.room.transform.x,
        z: snapped.room.transform.z,
        rotation: rot,
      };
    }
  }

  return best ?? entrance;
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
      const edgeALen = edgeLength(a.a, a.b);
      const edgeBLen = edgeLength(b.a, b.b);
      const shorter = Math.min(edgeALen, edgeBLen);
      // Wide inter-room passages (~65% of shared edge, floored by DEFAULT_DOOR_WIDTH).
      const roomDoor = Math.min(
        Math.max(DEFAULT_DOOR_WIDTH, shorter * 0.65),
        Math.max(0.6, shorter - 0.35),
      );
      connections.push({
        roomA: a.roomId,
        roomB: b.roomId,
        edgeA: a.edgeIndex,
        edgeB: b.edgeIndex,
        doorwayWidth: toEntrance ? ENTRANCE_WIDTH : roomDoor,
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

/** Unit-polygon AABB max span (before room scale). */
export function unitShapeMaxSpan(shape: RoomShape): number {
  const verts = shapeLocalVertices(shape);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  return Math.max(maxX - minX, maxZ - minZ, 1e-6);
}

/** Circumscale so world AABB max span ≈ TARGET_GALLERY_SPAN. */
export function defaultGalleryRoomScale(shape: RoomShape): number {
  return TARGET_GALLERY_SPAN / unitShapeMaxSpan(shape);
}

export function defaultRoomTransform(
  shape: RoomShape,
  index: number,
): RoomTransform {
  const base = defaultGalleryRoomScale(shape);
  const grid = TARGET_GALLERY_SPAN * 1.35;
  return {
    x: (index % 3) * grid,
    z: Math.floor(index / 3) * grid + TARGET_GALLERY_SPAN * 0.55,
    rotation: 0,
    scaleX: base,
    scaleZ: base,
  };
}
