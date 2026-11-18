import type { Vec2 } from "./layout-geometry";

export function signedAreaXZ(verts: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    a += verts[i].x * verts[j].z - verts[j].x * verts[i].z;
  }
  return a * 0.5;
}

function crossXZ(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function flipWinding(tris: number[]): void {
  for (let i = 0; i + 2 < tris.length; i += 3) {
    const tmp = tris[i + 1];
    tris[i + 1] = tris[i + 2];
    tris[i + 2] = tmp;
  }
}

function isConvex(a: Vec2, b: Vec2, c: Vec2, clockwise: boolean): boolean {
  const cross = crossXZ(a, b, c);
  return clockwise ? cross < 1e-5 : cross > -1e-5;
}

function sign(p: Vec2, a: Vec2, b: Vec2): number {
  return (p.x - b.x) * (a.z - b.z) - (a.x - b.x) * (p.z - b.z);
}

function pointInTriangleXZ(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

function isSimpleConvexXZ(verts: Vec2[]): boolean {
  if (verts.length < 3) return false;
  const area = signedAreaXZ(verts);
  if (Math.abs(area) < 1e-8) return false;
  const clockwise = area < 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const c = verts[(i + 2) % verts.length];
    if (!isConvex(a, b, c, clockwise)) return false;
  }
  return true;
}

function tryFanConvex(verts: Vec2[]): number[] | null {
  if (verts.length < 3) return null;
  const area = signedAreaXZ(verts);
  if (Math.abs(area) < 1e-8) return null;
  const tris: number[] = [];
  for (let i = 1; i < verts.length - 1; i++) {
    tris.push(0, i, i + 1);
  }
  if (area < 0) flipWinding(tris);
  return tris;
}

function isEar(
  verts: Vec2[],
  indices: number[],
  i0: number,
  i1: number,
  i2: number,
  clockwise: boolean,
): boolean {
  const a = verts[i0];
  const b = verts[i1];
  const c = verts[i2];
  if (!isConvex(a, b, c, clockwise)) return false;
  for (let k = 0; k < indices.length; k++) {
    const pi = indices[k];
    if (pi === i0 || pi === i1 || pi === i2) continue;
    if (pointInTriangleXZ(verts[pi], a, b, c)) return false;
  }
  return true;
}

/** Ear-clipping triangulation in XZ. */
export function triangulatePolygonXZ(verts: Vec2[]): number[] | null {
  if (!verts || verts.length < 3) return null;

  if (verts.length <= 12 && isSimpleConvexXZ(verts)) {
    return tryFanConvex(verts);
  }

  const area = signedAreaXZ(verts);
  if (Math.abs(area) < 1e-8) return null;
  const clockwise = area < 0;
  const indices: number[] = [];
  for (let i = 0; i < verts.length; i++) indices.push(i);

  const tris: number[] = [];
  let guard = verts.length * verts.length;

  while (indices.length > 2 && guard-- > 0) {
    let clipped = false;
    for (let i = 0; i < indices.length; i++) {
      const i0 = indices[(i + indices.length - 1) % indices.length];
      const i1 = indices[i];
      const i2 = indices[(i + 1) % indices.length];
      if (!isEar(verts, indices, i0, i1, i2, clockwise)) continue;
      tris.push(i0, i1, i2);
      indices.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) return null;
  }

  if (tris.length < 3) return null;
  ensureNormalsFaceUp(verts, tris);
  return tris;
}

export function ensureNormalsFaceUp(verts: Vec2[], tris: number[]): void {
  if (tris.length < 3) return;
  const cross = crossXZ(verts[tris[0]], verts[tris[1]], verts[tris[2]]);
  if (cross < 0) flipWinding(tris);
}

export function computeAabbXZ(
  verts: Vec2[],
): { minX: number; maxX: number; minZ: number; maxZ: number } | null {
  if (verts.length < 3) return null;
  let minX = verts[0].x;
  let maxX = verts[0].x;
  let minZ = verts[0].z;
  let maxZ = verts[0].z;
  for (let i = 1; i < verts.length; i++) {
    minX = Math.min(minX, verts[i].x);
    maxX = Math.max(maxX, verts[i].x);
    minZ = Math.min(minZ, verts[i].z);
    maxZ = Math.max(maxZ, verts[i].z);
  }
  if (maxX - minX < 1e-4 || maxZ - minZ < 1e-4) return null;
  return { minX, maxX, minZ, maxZ };
}