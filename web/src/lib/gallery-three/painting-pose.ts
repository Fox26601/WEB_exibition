import type { ArtworkPlacement, GalleryLayout, GalleryRoom } from "@/lib/catalog-types";
import { GALLERY_HEIGHT, WALL_INSET } from "./constants";
import {
  edgePoints,
  roomWorldVertices,
  type Vec2,
} from "@/lib/layout-geometry";
import { placementWorldPoint, resolvedWallHeightT } from "@/lib/placement-eval";
import {
  layoutOverlapRooms,
  wallSpansForEdge,
  type WallSpan,
} from "@/lib/room-overlap-clip";
import { inwardNormal, lerpVec2, roomCentroid } from "./room-geometry";

export type PaintingPose3D = {
  position: { x: number; y: number; z: number };
  /** Y-axis rotation in radians (faces into room). */
  yawRad: number;
  /** Mirror canvas U so poster title bars match Unity / source JPEGs. */
  flipCanvasU: boolean;
};

/** Snap hang point to a wall span that actually exists after overlap clip. */
export function resolveTAlongWallSpan(
  roomId: string,
  edgeIndex: number,
  tAlong: number,
  layout: GalleryLayout,
): number | null {
  const overlap = layoutOverlapRooms(layout);
  if (overlap.length <= 1) {
    return Math.max(0, Math.min(1, tAlong));
  }
  const spans = wallSpansForEdge(overlap, roomId, edgeIndex);
  if (spans.length === 0) return null;
  return nearestTOnSpans(tAlong, spans);
}

function nearestTOnSpans(t: number, spans: WallSpan[]): number {
  let bestT = Math.max(0, Math.min(1, t));
  let bestD = Infinity;
  for (const s of spans) {
    const c = Math.max(s.t0, Math.min(s.t1, t));
    const d = Math.abs(t - c);
    if (d < bestD) {
      bestD = d;
      bestT = c;
    }
  }
  return bestT;
}

export function paintingPoseFromPlacement(
  placement: ArtworkPlacement,
  layout: GalleryLayout,
): PaintingPose3D | null {
  if (placement.kind !== "painting") return null;
  const room = layout.rooms.find((r) => r.id === placement.roomId);
  if (!room) return null;
  const verts = roomWorldVertices(room);
  if (verts.length < 2) return null;
  const edgeIdx =
    ((placement.wallEdgeIndex ?? 0) % verts.length + verts.length) %
    verts.length;
  const [a, b] = edgePoints(verts, edgeIdx);
  const centroid = roomCentroid(verts) ?? lerpVec2(a, b, 0.5);
  const along = placementWorldPoint(placement, layout);
  if (!along) return null;
  const inward = inwardNormal(a, b, centroid);
  const hangY = GALLERY_HEIGHT * resolvedWallHeightT(placement);
  const yawRad = Math.atan2(inward.x, inward.z);
  // Sample JPEG title bars match Unity on hex walls; other room windings need unflipped UVs.
  const flipCanvasU = room.shape === "hexagon";
  return {
    position: {
      x: along.x + inward.x * WALL_INSET,
      y: hangY,
      z: along.z + inward.z * WALL_INSET,
    },
    yawRad,
    flipCanvasU,
  };
}

export function sculpturePoseFromPlacement(
  placement: ArtworkPlacement,
): { position: { x: number; y: number; z: number }; yawDeg: number } | null {
  if (placement.kind !== "sculpture") return null;
  if (placement.floorX == null || placement.floorZ == null) return null;
  return {
    position: { x: placement.floorX, y: 0, z: placement.floorZ },
    yawDeg: placement.yaw ?? 0,
  };
}

export function layoutWalkBounds(rooms: GalleryRoom[]): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let any = false;
  for (const room of rooms) {
    for (const v of roomWorldVertices(room)) {
      any = true;
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minZ = Math.min(minZ, v.z);
      maxZ = Math.max(maxZ, v.z);
    }
  }
  if (!any) return null;
  const pad = 0.4;
  return {
    minX: minX - pad,
    maxX: maxX + pad,
    minZ: minZ - pad,
    maxZ: maxZ + pad,
  };
}

export function layoutSpawnPoint(
  layout: GalleryLayout,
  bounds: NonNullable<ReturnType<typeof layoutWalkBounds>>,
): Vec2 {
  const ent = layout.entrance;
  if (ent) {
    return { x: ent.x, z: ent.z + 1.2 };
  }
  return {
    x: (bounds.minX + bounds.maxX) * 0.5,
    z: (bounds.minZ + bounds.maxZ) * 0.5,
  };
}