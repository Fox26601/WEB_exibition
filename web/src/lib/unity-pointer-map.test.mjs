import assert from "node:assert/strict";
import test from "node:test";
import { mapClientToUnityPointer } from "./unity-pointer-map.ts";

const rect = { left: 200, top: 100, width: 400, height: 300 };
const backing = { width: 800, height: 600 };

test("pointer over canvas center", () => {
  const m = mapClientToUnityPointer(400, 250, rect, backing);
  assert.equal(m.overCanvas, true);
  assert.ok(Math.abs(m.normU - 0.5) < 1e-6);
  assert.ok(Math.abs(m.normV - 0.5) < 1e-6);
  assert.ok(Math.abs(m.screenX - 400) < 1e-6);
  assert.ok(Math.abs(m.screenY - 300) < 1e-6);
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