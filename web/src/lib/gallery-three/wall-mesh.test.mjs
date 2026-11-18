import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { shapeLocalVertices, applyTransform } from "../layout-geometry.ts";
import { roomCentroid, inwardNormal } from "./room-geometry.ts";
import { addWallSlab } from "./wall-mesh.ts";

test("wall slab faces room interior for square room", () => {
  const verts = shapeLocalVertices("square").map((v) =>
    applyTransform(v, { x: 0, z: 4, rotation: 0, scaleX: 2.5, scaleZ: 2.5 }),
  );
  const centroid = roomCentroid(verts);
  assert.ok(centroid);
  const [a, b] = [verts[0], verts[1]];
  const inward = inwardNormal(a, b, centroid);

  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  addWallSlab(group, a, b, mat, centroid);
  const root = group.children[0];
  assert.ok(root);
  assert.ok(root.children.length >= 1);
  const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  const toCenter = { x: centroid.x - mid.x, z: centroid.z - mid.z };
  root.updateMatrixWorld(true);
  const faceNormal = new THREE.Vector3(1, 0, 0).applyQuaternion(root.quaternion);
  const dot = faceNormal.x * toCenter.x + faceNormal.z * toCenter.z;
  assert.ok(dot > 0.1, `wall +X should face centroid, dot=${dot}`);
});