import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ENTRANCE_POSE, ROOM_SHAPES } from "./catalog-types.ts";
import {
  ENTRANCE_ARCH_WIDTH,
  ENTRANCE_DEPTH,
  ENTRANCE_WIDTH,
  FOYER_REF_SPAN,
  GALLERY_TO_FOYER_SPAN_RATIO,
  TARGET_GALLERY_SPAN,
  applyFoyerRelativeRoomDefaults,
  defaultGalleryRoomScale,
  defaultRoomTransform,
  entranceWorldVertices,
  isLegacyDefaultRoomScale,
  rescaleRoomToFoyerDefault,
  roomWorldVertices,
  unitShapeMaxSpan,
} from "./layout-geometry.ts";
import {
  ENTRANCE_ARCH_WIDTH as BUILDER_ARCH_WIDTH,
  ENTRANCE_SCHEMATIC_DEPTH,
  ENTRANCE_WORLD_DEPTH,
} from "./gallery-three/entrance-builder.ts";
import { STEP_COUNT, STEP_DEPTH, STAIR_PORTAL_GAP } from "./gallery-three/constants.ts";

function aabbSpan(verts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  return Math.max(maxX - minX, maxZ - minZ);
}

function aabbSize(verts) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const v of verts) {
    minX = Math.min(minX, v.x);
    maxX = Math.max(maxX, v.x);
    minZ = Math.min(minZ, v.z);
    maxZ = Math.max(maxZ, v.z);
  }
  return { width: maxX - minX, depth: maxZ - minZ };
}

test("plan foyer AABB matches 3D corridor footprint", () => {
  assert.equal(ENTRANCE_DEPTH, ENTRANCE_WORLD_DEPTH);
  assert.equal(ENTRANCE_SCHEMATIC_DEPTH, ENTRANCE_WORLD_DEPTH);
  assert.equal(BUILDER_ARCH_WIDTH, ENTRANCE_ARCH_WIDTH);
  assert.ok(ENTRANCE_WIDTH > ENTRANCE_ARCH_WIDTH);
  assert.ok(ENTRANCE_DEPTH <= 4.5, "foyer depth stays human-scale (not 6 m tunnel)");
  const foyer = entranceWorldVertices(DEFAULT_ENTRANCE_POSE);
  const size = aabbSize(foyer);
  assert.ok(Math.abs(size.width - ENTRANCE_WIDTH) < 1e-6);
  assert.ok(Math.abs(size.depth - ENTRANCE_DEPTH) < 1e-6);
  assert.ok(Math.abs(aabbSpan(foyer) - FOYER_REF_SPAN) < 1e-6);
  const stairRun = STEP_COUNT * STEP_DEPTH + STAIR_PORTAL_GAP;
  assert.ok(
    stairRun < ENTRANCE_DEPTH - 1.0,
    "stair run leaves standing/spawn clear in foyer",
  );
});

test("default gallery rooms are ~2× foyer span for every shape", () => {
  assert.equal(FOYER_REF_SPAN, Math.max(ENTRANCE_WIDTH, ENTRANCE_DEPTH));
  assert.equal(TARGET_GALLERY_SPAN, FOYER_REF_SPAN * GALLERY_TO_FOYER_SPAN_RATIO);
  for (const shape of ROOM_SHAPES) {
    const t = defaultRoomTransform(shape, 0);
    assert.ok(Math.abs(t.scaleX - defaultGalleryRoomScale(shape)) < 1e-9);
    const verts = roomWorldVertices({ id: "r", shape, transform: t });
    const span = aabbSpan(verts);
    const ratio = span / FOYER_REF_SPAN;
    assert.ok(
      Math.abs(ratio - GALLERY_TO_FOYER_SPAN_RATIO) < 0.05,
      `${shape} ratio ${ratio}`,
    );
    assert.ok(unitShapeMaxSpan(shape) > 0);
  }
});

test("migration helper rescales stock defaults only", () => {
  const legacySquare = {
    id: "sq",
    shape: "square",
    transform: { x: 1, z: 2, rotation: 15, scaleX: 3.2, scaleZ: 3.2 },
  };
  const from96 = {
    id: "hex",
    shape: "hexagon",
    transform: {
      x: 0,
      z: 0,
      rotation: 0,
      scaleX: 12 / unitShapeMaxSpan("hexagon"),
      scaleZ: 12 / unitShapeMaxSpan("hexagon"),
    },
  };
  const custom = {
    id: "custom",
    shape: "square",
    transform: { x: 0, z: 0, rotation: 0, scaleX: 5.1, scaleZ: 4.4 },
  };
  assert.equal(isLegacyDefaultRoomScale(legacySquare), true);
  assert.equal(isLegacyDefaultRoomScale(from96), true);
  assert.equal(isLegacyDefaultRoomScale(custom), false);

  const scaled = rescaleRoomToFoyerDefault(legacySquare);
  assert.equal(scaled.transform.x, 1);
  assert.equal(scaled.transform.rotation, 15);
  assert.ok(
    Math.abs(scaled.transform.scaleX - defaultGalleryRoomScale("square")) < 1e-9,
  );

  const layout = applyFoyerRelativeRoomDefaults({
    version: 1,
    rooms: [legacySquare, from96, custom],
    connections: [],
    placements: [],
    entrance: { ...DEFAULT_ENTRANCE_POSE },
  });
  assert.ok(
    Math.abs(layout.rooms[0].transform.scaleX - defaultGalleryRoomScale("square")) <
      1e-9,
  );
  assert.ok(
    Math.abs(layout.rooms[1].transform.scaleX - defaultGalleryRoomScale("hexagon")) <
      1e-9,
  );
  assert.equal(layout.rooms[2].transform.scaleX, 5.1);
  assert.equal(layout.rooms[2].transform.scaleZ, 4.4);
});
