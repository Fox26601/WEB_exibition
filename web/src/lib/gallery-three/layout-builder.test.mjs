import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import fixture from "./prod-catalog.fixture.json" with { type: "json" };
import { normalizeLayout } from "../catalog-types.ts";
import { roomWorldVertices } from "../layout-geometry.ts";
import { FLOOR_COLOR, FLOOR_SURFACE_Y, WALL_COLOR } from "./constants.ts";
import {
  buildLayoutScene,
  buildRoomFloor,
  makeFloorMaterial,
  makeWallMaterial,
} from "./layout-builder.ts";
import { layoutOverlapRooms } from "../room-overlap-clip.ts";

function luminance(hex) {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe("floor material vs walls", () => {
  it("floor color is darker than wall color", () => {
    assert.ok(
      luminance(FLOOR_COLOR) < luminance(WALL_COLOR) - 0.05,
      `expected floor ${FLOOR_COLOR.toString(16)} darker than wall ${WALL_COLOR.toString(16)}`,
    );
  });

  it("makeFloorMaterial uses FLOOR_COLOR without a map", () => {
    const mat = makeFloorMaterial();
    assert.equal(mat.color.getHex(), FLOOR_COLOR);
    assert.equal(mat.map, null);
    mat.dispose();
  });
});

describe("buildLayoutScene floors", () => {
  it("reuses shared foyer floor material on every room floor", () => {
    const layout = normalizeLayout(fixture.layout);
    const floorMat = makeFloorMaterial();
    const wallMat = makeWallMaterial();
    const built = buildLayoutScene(layout, {}, { floorMat, wallMat });

    const floorMeshes = [];
    built.root.traverse((obj) => {
      const mesh = /** @type {THREE.Mesh} */ (obj);
      if (mesh.isMesh && typeof mesh.name === "string" && mesh.name.startsWith("Floor_")) {
        floorMeshes.push(mesh);
      }
    });

    assert.ok(floorMeshes.length >= layout.rooms.length, "one floor mesh per room");
    for (const mesh of floorMeshes) {
      assert.equal(mesh.material, floorMat);
    }

    built.dispose();
    floorMat.dispose();
    wallMat.dispose();
  });

  it("room floors cover the full polygon at foyer surface height with UVs", () => {
    const layout = normalizeLayout(fixture.layout);
    const overlap = layoutOverlapRooms(layout);
    const floorMat = makeFloorMaterial();

    for (const room of layout.rooms) {
      const parent = new THREE.Group();
      const verts = roomWorldVertices(room);
      const mesh = buildRoomFloor(parent, room.id, verts, overlap, floorMat);
      assert.ok(mesh, `floor mesh for ${room.id}`);

      const pos = mesh.geometry.getAttribute("position");
      const uv = mesh.geometry.getAttribute("uv");
      assert.ok(pos, "positions");
      assert.ok(uv, "uvs for foyer-parity tiling");
      assert.equal(pos.count, verts.length);

      for (let i = 0; i < verts.length; i++) {
        assert.ok(Math.abs(pos.getX(i) - verts[i].x) < 1e-6);
        assert.ok(Math.abs(pos.getY(i) - FLOOR_SURFACE_Y) < 1e-6);
        assert.ok(Math.abs(pos.getZ(i) - verts[i].z) < 1e-6);
      }

      const index = mesh.geometry.getIndex();
      assert.ok(index && index.count >= 3, "triangulated fill");
      mesh.geometry.dispose();
    }

    floorMat.dispose();
  });
});
