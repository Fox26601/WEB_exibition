import type { GalleryEntrancePose, GalleryLayout } from "@/lib/catalog-types";
import {
  DEFAULT_ENTRANCE_POSE,
  ENTRANCE_ROOM_ID,
} from "@/lib/catalog-types";
import {
  ENTRANCE_DEPTH,
  entranceWorldVertices,
  pointInPolygon,
  type Vec2,
} from "@/lib/layout-geometry";
import { PORTAL_FLOOR_INSET } from "./constants";

/** Portal world XZ + yaw (matches computeEntrancePose; no entrance-builder import). */
export function portalPoseFromEntrance(
  entrance: GalleryEntrancePose | null | undefined,
): { portal: { x: number; z: number }; yawRad: number } {
  const p = entrance ?? DEFAULT_ENTRANCE_POSE;
  const yawRad = ((p.rotation ?? 0) * Math.PI) / 180;
  const halfSchematic = ENTRANCE_DEPTH * 0.5;
  return {
    portal: {
      x: p.x - halfSchematic * Math.sin(yawRad),
      z: p.z + halfSchematic * Math.cos(yawRad),
    },
    yawRad,
  };
}

/** Local XZ of a world point relative to the entrance portal (+Z into gallery). */
export function worldToEntranceLocal(
  portal: { x: number; z: number },
  yawRad: number,
  p: Vec2,
): { x: number; z: number } {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const dx = p.x - portal.x;
  const dz = p.z - portal.z;
  return {
    x: dx * c - dz * s,
    z: dx * s + dz * c,
  };
}

/**
 * Sutherland–Hodgman clip against local-Z >= minLocalZ (gallery side of portal).
 * Cuts room floor that crosses the doorway into the foyer / stair volume.
 */
export function clipPolygonMinLocalZ(
  verts: Vec2[],
  portal: { x: number; z: number },
  yawRad: number,
  minLocalZ: number,
): Vec2[] {
  if (verts.length < 3) return verts.slice();

  const localZ = (p: Vec2) => worldToEntranceLocal(portal, yawRad, p).z;
  const inside = (p: Vec2) => localZ(p) >= minLocalZ - 1e-9;

  const intersect = (a: Vec2, b: Vec2): Vec2 => {
    const za = localZ(a);
    const zb = localZ(b);
    const t = (minLocalZ - za) / (zb - za || 1e-12);
    return {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
    };
  };

  const out: Vec2[] = [];
  for (let i = 0; i < verts.length; i++) {
    const cur = verts[i];
    const prev = verts[(i + verts.length - 1) % verts.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersect(prev, cur));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersect(prev, cur));
    }
  }
  return out.length >= 3 ? out : verts.slice();
}

/** True when this room has a doorway connection to the entrance portal. */
export function roomConnectsToEntrance(
  layout: GalleryLayout,
  roomId: string,
): boolean {
  for (const c of layout.connections) {
    if (c.roomA === roomId && c.roomB === ENTRANCE_ROOM_ID) return true;
    if (c.roomB === roomId && c.roomA === ENTRANCE_ROOM_ID) return true;
  }
  return false;
}

/**
 * Stop floor skins through the portal: clip entrance-connected rooms (and any
 * room whose polygon overlaps the foyer footprint) to gallery-local Z >= inset.
 */
export function clipRoomFloorForPortal(
  verts: Vec2[],
  layout: GalleryLayout,
  roomId: string,
  entrance: GalleryEntrancePose | null | undefined,
  inset: number = PORTAL_FLOOR_INSET,
): Vec2[] {
  const pose = portalPoseFromEntrance(entrance ?? layout.entrance);
  const foyer = entranceWorldVertices(entrance ?? layout.entrance);
  const overlapsFoyer = verts.some((v) => pointInPolygon(v, foyer));
  if (!roomConnectsToEntrance(layout, roomId) && !overlapsFoyer) {
    return verts;
  }
  const clipped = clipPolygonMinLocalZ(verts, pose.portal, pose.yawRad, inset);
  return clipped.length >= 3 ? clipped : verts;
}

/** Keep a floor triangle unless its centroid sits inside the foyer footprint. */
export function shouldKeepFloorTriangleOutsideFoyer(
  foyerVerts: Vec2[],
  centroid: Vec2,
): boolean {
  return !pointInPolygon(centroid, foyerVerts);
}
