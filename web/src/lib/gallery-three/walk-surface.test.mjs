import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GALLERY_FLOOR_RAISE,
  STEP_COUNT,
  STEP_DEPTH,
  STEP_RISE,
} from "./constants.ts";
import { sampleEyeY, sampleWalkSurfaceY } from "./walk-surface.ts";

describe("gallery raise constants", () => {
  it("GALLERY_FLOOR_RAISE equals STEP_COUNT * STEP_RISE", () => {
    assert.equal(STEP_COUNT, 6);
    assert.equal(STEP_RISE, 0.18);
    assert.equal(GALLERY_FLOOR_RAISE, 1.08);
    assert.equal(GALLERY_FLOOR_RAISE, STEP_COUNT * STEP_RISE);
    assert.ok(STEP_DEPTH > 0);
  });
});

describe("sampleWalkSurfaceY", () => {
  const galleryBounds = { minX: -2, maxX: 2, minZ: 0, maxZ: 8 };
  const climbBands = [
    { minX: -1.2, maxX: 1.2, minZ: -STEP_DEPTH * 3, maxZ: -STEP_DEPTH * 2, surfaceY: STEP_RISE },
    { minX: -1.2, maxX: 1.2, minZ: -STEP_DEPTH * 2, maxZ: -STEP_DEPTH, surfaceY: STEP_RISE * 2 },
    { minX: -1.2, maxX: 1.2, minZ: -STEP_DEPTH, maxZ: 0, surfaceY: GALLERY_FLOOR_RAISE },
    { minX: -1.2, maxX: 1.2, minZ: 0, maxZ: 0.3, surfaceY: GALLERY_FLOOR_RAISE },
  ];

  it("returns 0 outside gallery and bands (foyer)", () => {
    assert.equal(
      sampleWalkSurfaceY(0, -4, { climbBands, galleryBounds }),
      0,
    );
  });

  it("returns raise inside gallery bounds", () => {
    assert.equal(
      sampleWalkSurfaceY(0, 4, { climbBands, galleryBounds }),
      GALLERY_FLOOR_RAISE,
    );
  });

  it("picks the highest matching climb band", () => {
    assert.equal(
      sampleWalkSurfaceY(0, -STEP_DEPTH * 2.5, { climbBands, galleryBounds }),
      STEP_RISE,
    );
    assert.equal(
      sampleWalkSurfaceY(0, -STEP_DEPTH * 0.5, { climbBands, galleryBounds }),
      GALLERY_FLOOR_RAISE,
    );
  });

  it("lets lower stair bands win over overlapping gallery pad", () => {
    const paddedGallery = { minX: -2, maxX: 2, minZ: -0.4, maxZ: 8 };
    assert.equal(
      sampleWalkSurfaceY(0, -STEP_DEPTH * 2.5, {
        climbBands,
        galleryBounds: paddedGallery,
      }),
      STEP_RISE,
    );
  });

  it("sampleEyeY adds eye height", () => {
    const y = sampleEyeY(0, 4, { climbBands, galleryBounds });
    assert.equal(y, 1.6 + GALLERY_FLOOR_RAISE);
  });
});
