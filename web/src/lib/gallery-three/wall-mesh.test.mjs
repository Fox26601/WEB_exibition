import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { shapeLocalVertices, applyTransform } from "../layout-geometry.ts";
import { roomCentroid, inwardNormal } from "./room-geometry.ts";
import {
  DOORWAY_PASSAGE_THICKNESS,
  WALL_CORNER_JOIN,
  WALL_THICKNESS,
} from "./constants.ts";
import { addWallSlab, buildWallAlongEdge } from "./wall-mesh.ts";

test("wall slab faces room interior for square room", () => {
  const verts = shapeLocalVertices("square").map((v) =>
    applyTransform(v, { x: 0, z: 4, rotation: 0, scaleX: 2.5, scaleZ: 2.5 }),
  );
  const centroid = roomCentroid(verts);
  assert.ok(centroid);
  const [a, b] = [verts[0], verts[1]];

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

test("butt join: slab length equals edge (no miter overshoot)", () => {
  assert.equal(WALL_CORNER_JOIN, 0);
  const a = { x: 0, z: 0 };
  const b = { x: 4, z: 0 };
  const centroid = { x: 2, z: 1 };
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  addWallSlab(group, a, b, mat, centroid, 3, 0, {
    joinA: WALL_CORNER_JOIN,
    joinB: WALL_CORNER_JOIN,
  });
  const mesh = group.children[0].children[0];
  assert.ok(mesh);
  const params = mesh.geometry.parameters;
  assert.ok(
    Math.abs(params.depth - 4) < 1e-6,
    `slab depth ${params.depth} must equal edge length 4`,
  );
  assert.equal(params.width, WALL_THICKNESS);
});

test("doorway passage is one step thicker than walls", () => {
  assert.ok(
    DOORWAY_PASSAGE_THICKNESS > WALL_THICKNESS + 0.01,
    "doorway volume must be thicker than walls",
  );
  const a = { x: 0, z: 0 };
  const b = { x: 8, z: 0 };
  const verts = [
    { x: 0, z: 0 },
    { x: 8, z: 0 },
    { x: 8, z: 4 },
    { x: 0, z: 4 },
  ];
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial();
  buildWallAlongEdge(group, a, b, 4, mat, verts);
  let foundThick = false;
  group.traverse((obj) => {
    if (obj.isMesh && obj.geometry?.parameters) {
      if (
        Math.abs(obj.geometry.parameters.width - DOORWAY_PASSAGE_THICKNESS) <
        1e-6
      ) {
        foundThick = true;
      }
    }
  });
  assert.ok(
    foundThick,
    "doorway lintel/jambs must use DOORWAY_PASSAGE_THICKNESS",
  );
});
