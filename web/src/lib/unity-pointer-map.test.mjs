import assert from "node:assert/strict";
import test from "node:test";
import { mapClientToUnityPointer } from "./unity-pointer-map.ts";

const rect = { left: 200, top: 100, width: 400, height: 300 };
const backing = { width: 800, height: 600 };
const backingHd = { width: 1920, height: 1080 };

test("pointer over canvas center", () => {
  const m = mapClientToUnityPointer(400, 250, rect, backing);
  assert.equal(m.overCanvas, true);
  assert.ok(Math.abs(m.normU - 0.5) < 1e-6);
  assert.ok(Math.abs(m.normV - 0.5) < 1e-6);
  assert.ok(Math.abs(m.screenX - 400) < 1e-6);
  assert.ok(Math.abs(m.screenY - 300) < 1e-6);
  assert.equal(m.canvasWidth, 800);
  assert.equal(m.canvasHeight, 600);
});

test("pointer on sidebar is not over canvas", () => {
  const m = mapClientToUnityPointer(50, 250, rect, backing);
  assert.equal(m.overCanvas, false);
  assert.equal(m.normU, 0);
  assert.equal(m.normV, 0);
});

test("Y flip: top of canvas maps to high screenY", () => {
  const m = mapClientToUnityPointer(400, 100, rect, backing);
  assert.equal(m.overCanvas, true);
  assert.ok(Math.abs(m.normV - 1) < 1e-6);
  assert.ok(Math.abs(m.screenY - 600) < 1e-6);
});

test("bottom-left corner maps screenX and screenY to 0 with valid norms", () => {
  const m = mapClientToUnityPointer(200, 400, rect, backing);
  assert.equal(m.overCanvas, true);
  assert.ok(Math.abs(m.normU) < 1e-6);
  assert.ok(Math.abs(m.normV) < 1e-6);
  assert.ok(Math.abs(m.screenX) < 1e-6);
  assert.ok(Math.abs(m.screenY) < 1e-6);
});

test("top-right corner with HD backing", () => {
  const m = mapClientToUnityPointer(600, 100, rect, backingHd);
  assert.equal(m.overCanvas, true);
  assert.ok(Math.abs(m.normU - 1) < 1e-6);
  assert.ok(Math.abs(m.normV - 1) < 1e-6);
  assert.ok(Math.abs(m.screenX - 1920) < 1e-6);
  assert.ok(Math.abs(m.screenY - 1080) < 1e-6);
  assert.equal(m.canvasWidth, 1920);
  assert.equal(m.canvasHeight, 1080);
});

test("different CSS size vs backing (DPR-like)", () => {
  const wideRect = { left: 0, top: 0, width: 960, height: 540 };
  const m = mapClientToUnityPointer(960, 0, wideRect, backingHd);
  assert.equal(m.overCanvas, true);
  assert.ok(Math.abs(m.normU - 1) < 1e-6);
  assert.ok(Math.abs(m.normV - 1) < 1e-6);
  assert.ok(Math.abs(m.screenX - 1920) < 1e-6);
  assert.ok(Math.abs(m.screenY - 1080) < 1e-6);
});