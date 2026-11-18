import type { Vec2 } from "@/lib/layout-geometry";

export function roomCentroid(verts: Vec2[]): Vec2 | null {
  if (!verts.length) return null;
  let x = 0;
  let z = 0;
  for (const v of verts) {
    x += v.x;
    z += v.z;
  }
  return { x: x / verts.length, z: z / verts.length };
}

/** Inward normal for edge AB toward room centroid (Unity WallSnapUtility.InwardNormal). */
export function inwardNormal(a: Vec2, b: Vec2, centroid: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-6) return { x: 0, z: 1 };
  const ex = dx / len;
  const ez = dz / len;
  let nx = -ez;
  let nz = ex;
  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  const tcx = centroid.x - midX;
  const tcz = centroid.z - midZ;
  if (nx * tcx + nz * tcz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return { x: nx, z: nz };
}

export function edgeYawRad(a: Vec2, b: Vec2): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}

export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
}