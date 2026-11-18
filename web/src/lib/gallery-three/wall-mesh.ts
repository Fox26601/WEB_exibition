import * as THREE from "three";
import type { Vec2 } from "@/lib/layout-geometry";
import { GALLERY_HEIGHT, WALL_INSET } from "./constants";
import { inwardNormal, lerpVec2, roomCentroid } from "./room-geometry";

/** Vertical wall quad along edge AB; front face points into the room. */
export function addWallQuad(
  parent: THREE.Object3D,
  a: Vec2,
  b: Vec2,
  material: THREE.Material,
  centroid: Vec2,
  height: number = GALLERY_HEIGHT,
  bottomY = 0,
): void {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  if (len < 0.02) return;
  const inward = inwardNormal(a, b, centroid);
  const ax = a.x + inward.x * WALL_INSET;
  const az = a.z + inward.z * WALL_INSET;
  const bx = b.x + inward.x * WALL_INSET;
  const bz = b.z + inward.z * WALL_INSET;
  const topY = bottomY + height;

  const positions = new Float32Array([
    ax, bottomY, az,
    bx, bottomY, bz,
    bx, topY, bz,
    ax, topY, az,
  ]);

  const edgeX = bx - ax;
  const edgeZ = bz - az;
  const cross = edgeX * inward.z - edgeZ * inward.x;
  const indices =
    cross > 0
      ? new Uint16Array([0, 1, 2, 0, 2, 3])
      : new Uint16Array([0, 2, 1, 0, 3, 2]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(Array.from(indices));
  geom.computeVertexNormals();

  parent.add(new THREE.Mesh(geom, material));
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
    addWallQuad(parent, a, b, wallMat, centroid);
    return;
  }

  const halfDoor = doorwayWidth * 0.5;
  const halfRemain = (len - doorwayWidth) * 0.5;
  if (halfRemain < 0.05) {
    addWallQuad(parent, a, b, wallMat, centroid, GALLERY_HEIGHT - 2.2, 2.2);
    return;
  }

  const t1L = halfRemain / len;
  const t0R = 1 - t1L;
  addWallQuad(parent, lerpVec2(a, b, 0), lerpVec2(a, b, t1L), wallMat, centroid);
  addWallQuad(parent, lerpVec2(a, b, t0R), lerpVec2(a, b, 1), wallMat, centroid);
  addWallQuad(
    parent,
    lerpVec2(a, b, t1L),
    lerpVec2(a, b, t0R),
    wallMat,
    centroid,
    GALLERY_HEIGHT - 2.2,
    2.2,
  );
}