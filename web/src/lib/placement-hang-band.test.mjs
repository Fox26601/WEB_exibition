import assert from "node:assert/strict";
import test from "node:test";
import {
  hangYFromWallHeightT,
  usableHangBand,
} from "./placement-pose.ts";
import {
  gallerySurfaceY,
  galleryWallTopY,
} from "./gallery-three/constants.ts";
import { PAINTING_HEIGHT_MARGIN } from "./painting-frame.ts";
import { MIN_WALL_HEIGHT_T, MAX_WALL_HEIGHT_T } from "./catalog-types.ts";

test("usable hang band keeps frame between floor and wall top", () => {
  for (const h of [0.8, 1.4, 2.0]) {
    const { yMin, yMax } = usableHangBand(h);
    const half = h / 2;
    assert.ok(yMin - half >= gallerySurfaceY() + PAINTING_HEIGHT_MARGIN - 1e-6);
    assert.ok(yMax + half <= galleryWallTopY() - PAINTING_HEIGHT_MARGIN + 1e-6);
    assert.ok(yMax >= yMin);
  }
});

test("hangYFromWallHeightT maps slider extremes into band", () => {
  const h = 1.4;
  const { yMin, yMax } = usableHangBand(h);
  const low = hangYFromWallHeightT(MIN_WALL_HEIGHT_T, h);
  const high = hangYFromWallHeightT(MAX_WALL_HEIGHT_T, h);
  const mid = hangYFromWallHeightT(0.55, h);
  assert.ok(Math.abs(low - (yMin + (yMax - yMin) * MIN_WALL_HEIGHT_T)) < 1e-6);
  assert.ok(Math.abs(high - (yMin + (yMax - yMin) * MAX_WALL_HEIGHT_T)) < 1e-6);
  assert.ok(mid > low && mid < high);
  assert.ok(low - h / 2 >= gallerySurfaceY() + PAINTING_HEIGHT_MARGIN - 1e-6);
  assert.ok(high + h / 2 <= galleryWallTopY() - PAINTING_HEIGHT_MARGIN + 1e-6);
});
