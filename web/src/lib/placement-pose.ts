/**
 * Shared Place ↔ 3D placement pipeline.
 *
 * Admin markers and Three exhibition both resolve poses through these helpers
 * from GalleryLayout.placements + room figures — no alternate invent-on-generate path.
 */
import type {
  ArtworkPlacement,
  GalleryLayout,
  GalleryRoom,
  RoomTransform,
} from "./catalog-types";
import {
  DEFAULT_WALL_HEIGHT_T,
  MAX_WALL_HEIGHT_T,
  MIN_WALL_HEIGHT_T,
} from "./catalog-types";
import {
  applyTransform,
  edgePoints,
  inwardNormal,
  nearestWall,
  pointAlongEdge,
  roomCentroid,
  roomWorldVertices,
  yawFromEdge,
  type Vec2,
} from "./layout-geometry";
import {
  GALLERY_FLOOR_RAISE,
  WALL_INSET,
  gallerySurfaceY,
  galleryWallTopY,
} from "./gallery-three/constants";
import {
  PAINTING_HEIGHT_MARGIN,
  defaultPaintingOuterSize,
} from "./painting-frame";

export type PlacementWorldPose = {
  /** Hang / feet point in world XZ (wall along-edge or floor). */
  world: Vec2;
  /** Full 3D position (Y includes gallery floor raise). */
  position: { x: number; y: number; z: number };
  /** Painting: inward-facing yaw radians. Sculpture: catalog yaw degrees. */
  yawRad: number;
  yawDeg: number;
  kind: "painting" | "sculpture";
};

export function resolvedWallHeightT(p: ArtworkPlacement): number {
  if (p.kind !== "painting") return DEFAULT_WALL_HEIGHT_T;
  const t = p.wallHeightT;
  if (t == null || !Number.isFinite(t) || t <= 0) return DEFAULT_WALL_HEIGHT_T;
  return Math.max(MIN_WALL_HEIGHT_T, Math.min(MAX_WALL_HEIGHT_T, t));
}

/**
 * Usable hang-center Y range so a frame of `outerHeight` stays between
 * gallery floor surface and wall top (with margin).
 */
export function usableHangBand(outerHeight: number): {
  yMin: number;
  yMax: number;
} {
  const half = Math.max(
    0.05,
    (Number.isFinite(outerHeight) ? outerHeight : defaultPaintingOuterSize().height) /
      2,
  );
  const yFloor = gallerySurfaceY() + PAINTING_HEIGHT_MARGIN;
  const yCeil = galleryWallTopY() - PAINTING_HEIGHT_MARGIN;
  let yMin = yFloor + half;
  let yMax = yCeil - half;
  if (yMin > yMax) {
    const mid = (yFloor + yCeil) * 0.5;
    yMin = mid;
    yMax = mid;
  }
  return { yMin, yMax };
}

/** Map wallHeightT (usable-band fraction, clamped to slider range) → world Y. */
export function hangYFromWallHeightT(
  t: number,
  outerHeight: number = defaultPaintingOuterSize().height,
): number {
  const { yMin, yMax } = usableHangBand(outerHeight);
  const u =
    t == null || !Number.isFinite(t) || t <= 0
      ? DEFAULT_WALL_HEIGHT_T
      : Math.max(MIN_WALL_HEIGHT_T, Math.min(MAX_WALL_HEIGHT_T, t));
  return yMin + (yMax - yMin) * u;
}

export function clampWallHeightTForSize(
  t: number,
  _outerHeight?: number,
): number {
  if (t == null || !Number.isFinite(t) || t <= 0) return DEFAULT_WALL_HEIGHT_T;
  return Math.max(MIN_WALL_HEIGHT_T, Math.min(MAX_WALL_HEIGHT_T, t));
}

/** Inverse of applyTransform: world XZ → unit-local polygon space. */
export function inverseTransform(world: Vec2, t: RoomTransform): Vec2 {
  const dx = world.x - t.x;
  const dz = world.z - t.z;
  // applyTransform uses R=[[c,-s],[s,c]]; undo with R^T=[[c,s],[-s,c]].
  const rad = ((t.rotation || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const scaledX = c * dx + s * dz;
  const scaledZ = -s * dx + c * dz;
  const sx = t.scaleX || 1;
  const sz = t.scaleZ || 1;
  return { x: scaledX / sx, z: scaledZ / sz };
}

/** Map a world point through a room figure change (same local attachment). */
export function worldPointThroughRoomChange(
  world: Vec2,
  prev: GalleryRoom,
  next: GalleryRoom,
): Vec2 {
  const local = inverseTransform(world, prev.transform);
  return applyTransform(local, next.transform);
}

/**
 * World XZ for a saved placement (Place marker + pose along-edge).
 * Paintings: lerp on roomWorldVertices edge. Sculptures: floorX/floorZ as saved.
 */
export function placementWorldPoint(
  p: ArtworkPlacement,
  layout: GalleryLayout,
): Vec2 | null {
  if (p.kind === "sculpture") {
    if (p.floorX == null || p.floorZ == null) return null;
    if (!Number.isFinite(p.floorX) || !Number.isFinite(p.floorZ)) return null;
    return { x: p.floorX, z: p.floorZ };
  }

  if (p.wallEdgeIndex == null || p.tAlongEdge == null || !p.roomId) {
    return null;
  }

  const room = layout.rooms.find((r) => r.id === p.roomId);
  if (!room) return null;
  const verts = roomWorldVertices(room);
  if (verts.length < 2) return null;
  const i =
    ((p.wallEdgeIndex % verts.length) + verts.length) % verts.length;
  const [a, b] = edgePoints(verts, i);
  const t = Math.max(0, Math.min(1, p.tAlongEdge));
  return pointAlongEdge(a, b, t);
}

/**
 * Single resolver: Place schematic markers and Three exhibition hang/stand poses.
 * Does not invent alternate edge/t when placements exist — uses saved fields only.
 * @param outerHeight painting outer frame height (meters); defaults to square 1.4
 */
export function placementWorldPose(
  placement: ArtworkPlacement,
  layout: GalleryLayout,
  outerHeight: number = defaultPaintingOuterSize().height,
): PlacementWorldPose | null {
  if (placement.kind === "sculpture") {
    const world = placementWorldPoint(placement, layout);
    if (!world) return null;
    const yawDeg = placement.yaw ?? 0;
    return {
      world,
      position: {
        x: world.x,
        y: GALLERY_FLOOR_RAISE,
        z: world.z,
      },
      yawRad: (yawDeg * Math.PI) / 180,
      yawDeg,
      kind: "sculpture",
    };
  }

  if (placement.kind !== "painting") return null;
  const room = layout.rooms.find((r) => r.id === placement.roomId);
  if (!room) return null;
  const verts = roomWorldVertices(room);
  if (verts.length < 2) return null;
  const edgeIdx =
    ((placement.wallEdgeIndex ?? 0) % verts.length + verts.length) %
    verts.length;
  const [a, b] = edgePoints(verts, edgeIdx);
  const along = placementWorldPoint(placement, layout);
  if (!along) return null;
  const centroid = roomCentroid(verts);
  const inward = inwardNormal(a, b, centroid);
  const hangY = hangYFromWallHeightT(
    resolvedWallHeightT(placement),
    outerHeight,
  );
  const yawDeg = yawFromEdge(a, b, true, centroid);
  const yawRad = (yawDeg * Math.PI) / 180;
  return {
    world: along,
    position: {
      x: along.x + inward.x * WALL_INSET,
      y: hangY,
      z: along.z + inward.z * WALL_INSET,
    },
    yawRad,
    yawDeg,
    kind: "painting",
  };
}

const T_ALONG_MIN = 0.12;
const T_ALONG_MAX = 0.88;

/**
 * After a room figure rotate / snap / move / scale, re-resolve placements so
 * they stay attached to the same local wall / floor spot on that room.
 * Paintings: transform hang point with the room, then nearestWall on new verts.
 * Sculptures: transform floorX/Z the same way (they are stored in world XZ).
 */
export function remapPlacementsForRoomChange(
  placements: ArtworkPlacement[],
  prevRoom: GalleryRoom,
  nextRoom: GalleryRoom,
): ArtworkPlacement[] {
  if (prevRoom.id !== nextRoom.id) return placements;
  const sameTransform =
    prevRoom.transform.x === nextRoom.transform.x &&
    prevRoom.transform.z === nextRoom.transform.z &&
    (prevRoom.transform.rotation || 0) === (nextRoom.transform.rotation || 0) &&
    (prevRoom.transform.scaleX || 1) === (nextRoom.transform.scaleX || 1) &&
    (prevRoom.transform.scaleZ || 1) === (nextRoom.transform.scaleZ || 1) &&
    prevRoom.shape === nextRoom.shape;
  if (sameTransform) return placements;

  const prevLayoutStub: GalleryLayout = {
    rooms: [prevRoom],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  };

  return placements.map((p) => {
    if (p.roomId !== prevRoom.id) return p;

    if (p.kind === "sculpture") {
      if (p.floorX == null || p.floorZ == null) return p;
      const moved = worldPointThroughRoomChange(
        { x: p.floorX, z: p.floorZ },
        prevRoom,
        nextRoom,
      );
      return { ...p, floorX: moved.x, floorZ: moved.z };
    }

    if (p.kind !== "painting") return p;
    const along = placementWorldPoint(p, prevLayoutStub);
    if (!along) return p;
    const mapped = worldPointThroughRoomChange(along, prevRoom, nextRoom);
    const hit = nearestWall(mapped, nextRoom);
    if (!hit) return p;
    const tAlong = Math.max(T_ALONG_MIN, Math.min(T_ALONG_MAX, hit.t));
    const verts = roomWorldVertices(nextRoom);
    const yaw = yawFromEdge(hit.a, hit.b, true, roomCentroid(verts));
    return {
      ...p,
      wallEdgeIndex: hit.edgeIndex,
      tAlongEdge: tAlong,
      yaw,
    };
  });
}
