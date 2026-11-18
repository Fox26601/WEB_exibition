import assert from "node:assert/strict";
import test from "node:test";
import { applyTransform, shapeLocalVertices } from "./layout-geometry.ts";
import {
  ensureNormalsFaceUp,
  triangulatePolygonXZ,
} from "./polygon-floor.ts";

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

test("triangulatePolygonXZ winds floors for +Y Three.js normals", () => {
  for (const shape of shapes) {
    for (const t of transforms) {
      const verts = roomVerts(shape, t);
      const tris = triangulatePolygonXZ(verts);
      assert.ok(tris && tris.length >= 3, `${shape} triangulated`);
      const cross = crossFirstTriangle(verts, tris);
      // ny = -crossXZ; need cross < 0 so FrontSide floors face the camera.
      assert.ok(
        cross < 0,
        `${shape} @ rot=${t.rotation} scaleX=${t.scaleX}: cross=${cross}`,
      );
    }
  }
});

test("ensureNormalsFaceUp flips downward XZ winding", () => {
  const verts = [
    { x: 0, z: 0 },
    { x: 2, z: 0 },
    { x: 0, z: 2 },
  ];
  // Positive XZ cross → downward in Y-up.
  const tris = [0, 1, 2];
  assert.ok(crossFirstTriangle(verts, tris) > 0);
  ensureNormalsFaceUp(verts, tris);
  assert.ok(crossFirstTriangle(verts, tris) < 0);
});