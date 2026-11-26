import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_ENTRANCE_POSE, ROOM_SHAPES } from "./catalog-types.ts";
import {
  ENTRANCE_DEPTH,
  ENTRANCE_WIDTH,
  FOYER_REF_SPAN,
  GALLERY_TO_FOYER_SPAN_RATIO,
  TARGET_GALLERY_SPAN,
  defaultGalleryRoomScale,
  defaultRoomTransform,
  entranceWorldVertices,
  roomWorldVertices,
  unitShapeMaxSpan,
} from "./layout-geometry.ts";
import {
  ENTRANCE_SCHEMATIC_DEPTH,
  ENTRANCE_WORLD_DEPTH,
} from "./gallery-three/entrance-builder.ts";

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

test("plan foyer depth matches 3D corridor depth", () => {
  assert.equal(ENTRANCE_DEPTH, ENTRANCE_WORLD_DEPTH);
  assert.equal(ENTRANCE_SCHEMATIC_DEPTH, ENTRANCE_WORLD_DEPTH);
  const foyer = entranceWorldVertices(DEFAULT_ENTRANCE_POSE);
  const span = aabbSpan(foyer);
  assert.ok(Math.abs(span - Math.max(ENTRANCE_WIDTH, ENTRANCE_DEPTH)) < 1e-6);
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
