import * as THREE from "three";
import type { Vec2 } from "@/lib/layout-geometry";
import {
  FLOOR_Y,
  GALLERY_HEIGHT,
  WALL_CORNER_MITER,
  WALL_PLANE_BIAS,
  WALL_THICKNESS,
} from "./constants";
import { inwardNormal, lerpVec2, roomCentroid } from "./room-geometry";

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
): void {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.02) return;
  const ux = dx / len;
  const uz = dz / len;
  const miter = Math.min(WALL_CORNER_MITER, len * 0.45);
  const slabLen = len + 2 * miter;
  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  const inward = inwardNormal(a, b, centroid);

  let yaw = Math.atan2(dx, dz);
  const localXx = Math.cos(yaw);
  const localXz = -Math.sin(yaw);
  if (localXx * inward.x + localXz * inward.z < 0) {
    yaw += Math.PI;
  }
  const interiorSign =
    Math.cos(yaw) * inward.x + -Math.sin(yaw) * inward.z >= 0 ? 1 : -1;

  /** Center slab on the layout edge (half thickness inside/outside), Unity-like. */
  const group = new THREE.Group();
  group.position.set(
    midX + inward.x * WALL_PLANE_BIAS,
    bottomY + height * 0.5,
    midZ + inward.z * WALL_PLANE_BIAS,
  );
  group.rotation.y = yaw;
  const halfT = WALL_THICKNESS * 0.5;
  const shellDepth = Math.max(halfT - 0.001, 0.04);
  const shellOffset = (shellDepth + 0.001) * 0.5;
  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(shellDepth, height, slabLen),
    material,
  );
  interior.position.x = interiorSign * shellOffset;
  const exterior = new THREE.Mesh(
    new THREE.BoxGeometry(shellDepth, height, slabLen),
    material,
  );
  exterior.position.x = -interiorSign * shellOffset;
  group.add(interior, exterior);
  parent.add(group);
}

/** Vertical column at polygon vertices so slab walls meet without sky slivers. */
export function addCornerPosts(
  parent: THREE.Object3D,
  verts: Vec2[],
  material: THREE.Material,
): void {
  const centroid = roomCentroid(verts);
  if (!centroid || verts.length < 3) return;
  const n = verts.length;
  const postY = FLOOR_Y + GALLERY_HEIGHT * 0.5;
  const postH = GALLERY_HEIGHT - FLOOR_Y;
  for (let i = 0; i < n; i++) {
    const prev = verts[(i - 1 + n) % n];
    const cur = verts[i];
    const next = verts[(i + 1) % n];
    const inPrev = inwardNormal(prev, cur, centroid);
    const inNext = inwardNormal(cur, next, centroid);
    let bx = inPrev.x + inNext.x;
    let bz = inPrev.z + inNext.z;
    const blen = Math.hypot(bx, bz);
    if (blen < 1e-6) continue;
    bx /= blen;
    bz /= blen;
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(WALL_THICKNESS * 1.6, postH, WALL_THICKNESS * 1.6),
      material,
    );
    post.position.set(
      cur.x + bx * WALL_PLANE_BIAS,
      postY,
      cur.z + bz * WALL_PLANE_BIAS,
    );
    post.rotation.y = Math.atan2(bx, bz);
    parent.add(post);
  }
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

  const halfDoor = doorwayWidth * 0.5;
  const halfRemain = (len - doorwayWidth) * 0.5;
  if (halfRemain < 0.05) {
    addWallSlab(parent, a, b, wallMat, centroid, GALLERY_HEIGHT - 2.2 - FLOOR_Y, FLOOR_Y + 2.2);
    return;
  }

  const t1L = halfRemain / len;
  const t0R = 1 - t1L;
  addWallSlab(parent, lerpVec2(a, b, 0), lerpVec2(a, b, t1L), wallMat, centroid);
  addWallSlab(parent, lerpVec2(a, b, t0R), lerpVec2(a, b, 1), wallMat, centroid);
  addWallSlab(
    parent,
    lerpVec2(a, b, t1L),
    lerpVec2(a, b, t0R),
    wallMat,
    centroid,
    GALLERY_HEIGHT - 2.2,
    2.2,
  );
}