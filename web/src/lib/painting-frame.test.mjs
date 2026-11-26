import assert from "node:assert/strict";
import test from "node:test";
import {
  PAINTING_ASPECT_MAX,
  PAINTING_ASPECT_MIN,
  PAINTING_LONG_SIDE,
  clampMediaAspect,
  defaultPaintingOuterSize,
  mediaAspect,
  paintingCanvasSize,
  paintingOuterSize,
} from "./painting-frame.ts";

test("mediaAspect falls back to 1 when dims missing", () => {
  assert.equal(mediaAspect({}), 1);
  assert.equal(mediaAspect({ mediaWidth: 0, mediaHeight: 10 }), 1);
  assert.equal(mediaAspect({ mediaWidth: 1920, mediaHeight: 1080 }), 1920 / 1080);
});

test("paintingOuterSize preserves aspect with long-side budget", () => {
  const sq = paintingOuterSize(1);
  assert.ok(Math.abs(sq.width - PAINTING_LONG_SIDE) < 1e-9);
  assert.ok(Math.abs(sq.height - PAINTING_LONG_SIDE) < 1e-9);

  const land = paintingOuterSize(16 / 9);
  assert.ok(Math.abs(land.width - PAINTING_LONG_SIDE) < 1e-9);
  assert.ok(land.height < land.width);
  assert.ok(Math.abs(land.width / land.height - 16 / 9) < 1e-6);

  const port = paintingOuterSize(9 / 16);
  assert.ok(Math.abs(port.height - PAINTING_LONG_SIDE) < 1e-9);
  assert.ok(port.width < port.height);
});

test("clampMediaAspect limits extremes", () => {
  assert.equal(clampMediaAspect(0.01), PAINTING_ASPECT_MIN);
  assert.equal(clampMediaAspect(99), PAINTING_ASPECT_MAX);
  const ultra = paintingOuterSize(99);
  assert.ok(Math.abs(ultra.width / ultra.height - PAINTING_ASPECT_MAX) < 1e-6);
});

test("paintingCanvasSize insets outer", () => {
  const outer = defaultPaintingOuterSize();
  const canvas = paintingCanvasSize(outer);
  assert.ok(canvas.width < outer.width);
  assert.ok(canvas.height < outer.height);
});
