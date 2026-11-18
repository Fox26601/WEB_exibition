import * as THREE from "three";
import type { Vec2 } from "@/lib/layout-geometry";
import {
  DOOR_CLEAR_HEIGHT,
  FLOOR_Y,
  GALLERY_HEIGHT,
  WALL_CORNER_JOIN,
  WALL_PLANE_BIAS,
  WALL_THICKNESS,
} from "./constants";
import { inwardNormal, lerpVec2, roomCentroid } from "./room-geometry";

export type WallSlabJoins = {
  /** Meters to extend past endpoint A (vertex join). */
  joinA?: number;
  /** Meters to extend past endpoint B (vertex join). */
  joinB?: number;
};

/**
 * Oriented wall slab along edge AB (Unity RoomBuilder parity): thickness on
 * local X, length on local Z. Vertex ends get a half-thickness join pad so
 * adjacent outer faces meet; mid/door ends stay flush (join = 0).
 */
export function addWallSlab(
  parent: THREE.Object3D,
  a: Vec2,
  b: Vec2,
  material: THREE.Material,
  centroid: Vec2,
  height: number = GALLERY_HEIGHT - FLOOR_Y,
  bottomY = FLOOR_Y,
  joins: WallSlabJoins = {},
): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.02) return;
  const ux = dx / len;
  const uz = dz / len;
  const joinA = Math.max(0, joins.joinA ?? 0);
  const joinB = Math.max(0, joins.joinB ?? 0);
  const maxJoin = Math.min(WALL_CORNER_JOIN, len * 0.45);
  const padA = Math.min(joinA, maxJoin);
  const padB = Math.min(joinB, maxJoin);
  const slabLen = len + padA + padB;
  const midX = (a.x + b.x) * 0.5 + ux * ((padB - padA) * 0.5);
  const midZ = (a.z + b.z) * 0.5 + uz * ((padB - padA) * 0.5);
  const inward = inwardNormal(a, b, centroid);

  let yaw = Math.atan2(dx, dz);
  const localXx = Math.cos(yaw);
  const localXz = -Math.sin(yaw);
  if (localXx * inward.x + localXz * inward.z < 0) {
    yaw += Math.PI;
  }
  /** Center slab on the layout edge (half thickness inside/outside), Unity-like. */
  const group = new THREE.Group();
  group.position.set(
    midX + inward.x * WALL_PLANE_BIAS,
    bottomY + height * 0.5,
    midZ + inward.z * WALL_PLANE_BIAS,
  );
  group.rotation.y = yaw;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS, height, slabLen),
    material,
  );
  group.add(slab);
  parent.add(group);
}

/** @deprecated use addWallSlab — kept for tests comparing legacy quads */
export function addWallQuad(
  parent: THREE.Object3D,
  a: Vec2,
  b: Vec2,
  material: THREE.Material,
  centroid: Vec2,
  height: number = GALLERY_HEIGHT,
  bottomY = 0,
): void {
  addWallSlab(parent, a, b, material, centroid, height, bottomY);
}

export type WallEdgeJoins = {
  cornerA?: boolean;
  cornerB?: boolean;
  /** Explicit join pads from LayoutWallPlan (meters). */
  joinA?: number;
  joinB?: number;
};

function resolveJoin(
  corner: boolean | undefined,
  explicit: number | undefined,
): number {
  if (explicit != null && explicit >= 0) return explicit;
  return corner ? WALL_CORNER_JOIN : 0;
}

export function buildWallAlongEdge(
  parent: THREE.Object3D,
  a: Vec2,
  b: Vec2,
  doorwayWidth: number,
  wallMat: THREE.Material,
  verts: Vec2[],
  joins: WallEdgeJoins = {},
): void {
  const centroid = roomCentroid(verts) ?? lerpVec2(a, b, 0.5);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const joinA = resolveJoin(joins.cornerA, joins.joinA);
  const joinB = resolveJoin(joins.cornerB, joins.joinB);

  if (doorwayWidth <= 0.01 || doorwayWidth >= len - 0.2) {
    addWallSlab(parent, a, b, wallMat, centroid, GALLERY_HEIGHT - FLOOR_Y, FLOOR_Y, {
      joinA,
      joinB,
    });
    return;
  }

  const halfRemain = (len - doorwayWidth) * 0.5;
  const lintelBottom = FLOOR_Y + DOOR_CLEAR_HEIGHT;
  const lintelH = Math.max(0.18, GALLERY_HEIGHT - lintelBottom);
  if (halfRemain < 0.05) {
    addWallSlab(
      parent,
      a,
      b,
      wallMat,
      centroid,
      lintelH,
      lintelBottom,
      { joinA: 0, joinB: 0 },
    );
    return;
  }

  const t1L = halfRemain / len;
  const t0R = 1 - t1L;
  // Outer ends: half-thickness join; doorway ends stay flush (no jamb posts).
  addWallSlab(
    parent,
    lerpVec2(a, b, 0),
    lerpVec2(a, b, t1L),
    wallMat,
    centroid,
    GALLERY_HEIGHT - FLOOR_Y,
    FLOOR_Y,
    { joinA, joinB: 0 },
  );
  addWallSlab(
    parent,
    lerpVec2(a, b, t0R),
    lerpVec2(a, b, 1),
    wallMat,
    centroid,
    GALLERY_HEIGHT - FLOOR_Y,
    FLOOR_Y,
    { joinA: 0, joinB },
  );
  addWallSlab(
    parent,
    lerpVec2(a, b, t1L),
    lerpVec2(a, b, t0R),
    wallMat,
    centroid,
    lintelH,
    lintelBottom,
    { joinA: 0, joinB: 0 },
  );
}
