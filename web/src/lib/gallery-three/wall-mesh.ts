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
  height: number = GALLERY_HEIGHT - FLOOR_Y + 0.05,
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
  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(WALL_THICKNESS * 1.15, 0.12, slabLen + miter * 0.4),
    material,
  );
  cap.position.y = height * 0.5;
  group.add(cap);
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
  const postH = GALLERY_HEIGHT - FLOOR_Y + 0.05;
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
      new THREE.BoxGeometry(WALL_THICKNESS * 3.2, postH + 0.1, WALL_THICKNESS * 3.2),
      material,
    );
    post.position.set(cur.x, postY, cur.z);
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
  const doorHeadH = GALLERY_HEIGHT - FLOOR_Y + 0.08 - 2.2;
  addWallSlab(
    parent,
    lerpVec2(a, b, t1L),
    lerpVec2(a, b, t0R),
    wallMat,
    centroid,
    doorHeadH,
    FLOOR_Y + 2.2,
  );
  const jambH = 2.25;
  const jambY = FLOOR_Y + jambH * 0.5;
  const jambT = Math.max(WALL_THICKNESS, 0.14);
  const left = lerpVec2(a, b, t1L);
  const right = lerpVec2(a, b, t0R);
  for (const p of [left, right]) {
    const jamb = new THREE.Mesh(
      new THREE.BoxGeometry(jambT, jambH, jambT),
      wallMat,
    );
    jamb.position.set(p.x, jambY, p.z);
    parent.add(jamb);
  }
}