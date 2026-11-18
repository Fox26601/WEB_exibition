import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { shapeLocalVertices, applyTransform } from "../layout-geometry.ts";
import { roomCentroid, inwardNormal } from "./room-geometry.ts";
import { addWallQuad } from "./wall-mesh.ts";

test("wall quad normal faces room interior for square room", () => {
  const verts = shapeLocalVertices("square").map((v) =>
    applyTransform(v, { x: 0, z: 4, rotation: 0, scaleX: 2.5, scaleZ: 2.5 }),
  );
  const centroid = roomCentroid(verts);
  assert.ok(centroid);
  const [a, b] = [verts[0], verts[1]];
  const inward = inwardNormal(a, b, centroid);

  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  addWallQuad(group, a, b, mat, centroid);
  const mesh = group.children[0];
  assert.ok(mesh?.isMesh);
  const geom = mesh.geometry;
  geom.computeVertexNormals();
  const pos = geom.attributes.position;
  const idx = geom.index.array;
  const tri = new THREE.Triangle(
    new THREE.Vector3(pos.getX(idx[0]), pos.getY(idx[0]), pos.getZ(idx[0])),
    new THREE.Vector3(pos.getX(idx[1]), pos.getY(idx[1]), pos.getZ(idx[1])),
    new THREE.Vector3(pos.getX(idx[2]), pos.getY(idx[2]), pos.getZ(idx[2])),
  );
  const normal = new THREE.Vector3();
  tri.getNormal(normal);
  const mid = { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 };
  const toCenter = { x: centroid.x - mid.x, z: centroid.z - mid.z };
  const dot = normal.x * toCenter.x + normal.z * toCenter.z;
  assert.ok(dot > 0.1, `wall normal should point toward centroid, dot=${dot}`);
});