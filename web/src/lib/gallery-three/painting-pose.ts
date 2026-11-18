import type { ArtworkPlacement, GalleryLayout, GalleryRoom } from "@/lib/catalog-types";
import { GALLERY_HEIGHT, WALL_INSET } from "./constants";
import {
  edgePoints,
  roomWorldVertices,
  type Vec2,
} from "@/lib/layout-geometry";
import { resolvedWallHeightT } from "@/lib/placement-eval";
import { inwardNormal, lerpVec2, roomCentroid } from "./room-geometry";

export type PaintingPose3D = {
  position: { x: number; y: number; z: number };
  /** Y-axis rotation in radians (faces into room). */
  yawRad: number;
};

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
  const t = Math.max(0, Math.min(1, placement.tAlongEdge ?? 0.5));
  const along = lerpVec2(a, b, t);
  const inward = inwardNormal(a, b, centroid);
  const hangY = GALLERY_HEIGHT * resolvedWallHeightT(placement);
  const yawRad = Math.atan2(inward.x, inward.z);
  return {
    position: {
      x: along.x + inward.x * WALL_INSET,
      y: hangY,
      z: along.z + inward.z * WALL_INSET,
    },
    yawRad,
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