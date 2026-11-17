import assert from "node:assert/strict";
import test from "node:test";
import { applyTransform, shapeLocalVertices } from "./layout-geometry.ts";

function signedAreaXZ(verts) {
  let a = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    a += verts[i].x * verts[j].z - verts[j].x * verts[i].z;
  }
  return a * 0.5;
}

function fanTriangles(verts) {
  const tris = [];
  for (let i = 1; i < verts.length - 1; i++) {
    tris.push(0, i, i + 1);
  }
  return tris;
}

function flipWinding(tris) {
  const out = [...tris];
  for (let i = 0; i + 2 < out.length; i += 3) {
    const tmp = out[i + 1];
    out[i + 1] = out[i + 2];
    out[i + 2] = tmp;
  }
  return out;
}

function crossFirstTriangle(verts, tris) {
  const a = verts[tris[0]];
  const b = verts[tris[1]];
  const c = verts[tris[2]];
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function roomVerts(shape, t) {
  return shapeLocalVertices(shape).map((v) => applyTransform(v, t));
}

const shapes = ["triangle", "square", "pentagon", "hexagon"];
const transforms = [
  { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
  { x: 4, z: -2, rotation: 33, scaleX: 2.8, scaleZ: 2.8 },
  { x: -1, z: 6, rotation: 210, scaleX: -2.4, scaleZ: 2.2 },
];

test("layout room polygons keep upward-facing fan winding", () => {
  for (const shape of shapes) {
    for (const t of transforms) {
      const verts = roomVerts(shape, t);
      const area = signedAreaXZ(verts);
      assert.ok(Math.abs(area) > 1e-6, `${shape} degenerate area`);
      let tris = fanTriangles(verts);
      if (area < 0) {
        tris = flipWinding(tris);
      }
      const cross = crossFirstTriangle(verts, tris);
      assert.ok(cross > 0, `${shape} @ rot=${t.rotation} scaleX=${t.scaleX}: cross=${cross}`);
    }
  }
});