import assert from "node:assert/strict";
import test from "node:test";
import {
  EDITOR_PLAN_VIEW_H,
  EDITOR_PLAN_VIEW_W,
  clientToEditorSvg,
  clientToEditorWorld,
  editorPlanOrigin,
  editorSvgToWorld,
  worldToEditorSvg,
} from "./layout-editor-projection.ts";
import { normalizeLayout } from "./catalog-types.ts";

test("clientToEditorSvg maps viewport rect into SVG user space", () => {
  const w = EDITOR_PLAN_VIEW_W / 2;
  const h = EDITOR_PLAN_VIEW_H / 2;
  const svg = {
    getBoundingClientRect: () => ({
      left: 100,
      top: 50,
      width: w,
      height: h,
      right: 100 + w,
      bottom: 50 + h,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    }),
  };

  const mid = clientToEditorSvg(100 + w / 2, 50 + h / 2, svg);
  assert.ok(mid);
  assert.ok(Math.abs(mid.x - EDITOR_PLAN_VIEW_W / 2) < 1e-6);
  assert.ok(Math.abs(mid.y - EDITOR_PLAN_VIEW_H / 2) < 1e-6);

  const empty = clientToEditorSvg(0, 0, {
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
  assert.equal(empty, null);
});

test("clientToEditorWorld round-trips a room vertex via SVG projection", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: "r1",
        shape: "square",
        transform: { x: 0, z: 4, rotation: 0, scaleX: 3.2, scaleZ: 3.2 },
      },
    ],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const origin = editorPlanOrigin(layout.rooms, layout.entrance);
  const world = { x: 0, z: 4 };
  const svgPt = worldToEditorSvg(world, origin);
  const scale = 0.5;
  const rect = {
    left: 40,
    top: 20,
    width: EDITOR_PLAN_VIEW_W * scale,
    height: EDITOR_PLAN_VIEW_H * scale,
    right: 40 + EDITOR_PLAN_VIEW_W * scale,
    bottom: 20 + EDITOR_PLAN_VIEW_H * scale,
    x: 40,
    y: 20,
    toJSON: () => ({}),
  };
  const clientX = rect.left + (svgPt.x / EDITOR_PLAN_VIEW_W) * rect.width;
  const clientY = rect.top + (svgPt.y / EDITOR_PLAN_VIEW_H) * rect.height;
  const back = clientToEditorWorld(clientX, clientY, { getBoundingClientRect: () => rect }, origin);
  assert.ok(back);
  assert.ok(Math.hypot(back.x - world.x, back.z - world.z) < 1e-6);

  const fromUser = editorSvgToWorld(svgPt.x, svgPt.y, origin);
  assert.ok(Math.hypot(fromUser.x - world.x, fromUser.z - world.z) < 1e-6);
});
