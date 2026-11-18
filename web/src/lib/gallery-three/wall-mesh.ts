import * as THREE from "three";
import type { Vec2 } from "@/lib/layout-geometry";
import {
  DOOR_CLEAR_HEIGHT,
  FLOOR_Y,
  GALLERY_HEIGHT,
  WALL_CORNER_MITER,
  WALL_PLANE_BIAS,
  WALL_THICKNESS,
} from "./constants";
import { inwardNormal, lerpVec2, roomCentroid } from "./room-geometry";

export type WallSlabMiter = {
  /** Extend past endpoint A along the edge. Default true. */
  miterA?: boolean;
  /** Extend past endpoint B along the edge. Default true. */
  miterB?: boolean;
};

/**
 * Oriented wall slab along edge AB (Unity RoomBuilder parity): thickness on
 * local X, length on local Z, overlapped at corners via miter extension.
 */
export function addWallSlab(
  parent: THREE.Object3D,
  a: Vec2,
  b: Vec2,
  material: THREE.Material,
  centroid: Vec2,
  height: number = GALLERY_HEIGHT - FLOOR_Y,
  bottomY = FLOOR_Y,
  miter: WallSlabMiter = {},
): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.02) return;
  const ux = dx / len;
  const uz = dz / len;
  const maxMiter = Math.min(WALL_CORNER_MITER, len * 0.45);
  const miterA = miter.miterA === false ? 0 : maxMiter;
  const miterB = miter.miterB === false ? 0 : maxMiter;
  const slabLen = len + miterA + miterB;
  const midShift = (miterB - miterA) * 0.5;
  const midX = (a.x + b.x) * 0.5 + ux * midShift;
  const midZ = (a.z + b.z) * 0.5 + uz * midShift;
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

export function buildWallAlongEdge(
  parent: THREE.Object3D,
  a: Vec2,
  b: Vec2,
  doorwayWidth: number,
  wallMat: THREE.Material,
  verts: Vec2[],
): void {
  const centroid = roomCentroid(verts) ?? lerpVec2(a, b, 0.5);
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (doorwayWidth <= 0.01 || doorwayWidth >= len - 0.2) {
    addWallSlab(parent, a, b, wallMat, centroid);
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
      { miterA: false, miterB: false },
    );
    return;
  }

  const t1L = halfRemain / len;
  const t0R = 1 - t1L;
  // Outer ends keep miter for corner joints; doorway ends stay flush (no jamb posts).
  addWallSlab(
    parent,
    lerpVec2(a, b, 0),
    lerpVec2(a, b, t1L),
    wallMat,
    centroid,
    GALLERY_HEIGHT - FLOOR_Y,
    FLOOR_Y,
    { miterA: true, miterB: false },
  );
  addWallSlab(
    parent,
    lerpVec2(a, b, t0R),
    lerpVec2(a, b, 1),
    wallMat,
    centroid,
    GALLERY_HEIGHT - FLOOR_Y,
    FLOOR_Y,
    { miterA: false, miterB: true },
  );
  addWallSlab(
    parent,
    lerpVec2(a, b, t1L),
    lerpVec2(a, b, t0R),
    wallMat,
    centroid,
    lintelH,
    lintelBottom,
    { miterA: false, miterB: false },
  );
}
