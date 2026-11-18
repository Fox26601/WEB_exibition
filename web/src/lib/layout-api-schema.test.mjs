import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_WALL_HEIGHT_T,
  MAX_WALL_HEIGHT_T,
  MIN_WALL_HEIGHT_T,
} from "./catalog-types.ts";
import { parseLayoutApiBody } from "./layout-api-schema.ts";

function sampleBody(wallHeightT, roomColors) {
  return {
    rooms: [
      {
        id: "r1",
        shape: "square",
        transform: { x: 0, z: 4, rotation: 0, scaleX: 3.2, scaleZ: 3.2 },
        ...(roomColors ?? {}),
      },
    ],
    connections: [],
    placements: [
      {
        artworkId: "a1",
        kind: "painting",
        roomId: "r1",
        wallEdgeIndex: 0,
        tAlongEdge: 0.5,
        ...(wallHeightT !== undefined ? { wallHeightT } : {}),
        yaw: 180,
        frameId: "wood",
      },
    ],
    entrance: { x: 0, z: -2, rotation: 0 },
  };
}

test("layout API schema keeps painting wallHeightT through parse", () => {
  const parsed = parseLayoutApiBody(sampleBody(0.72));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.layout.placements[0].wallHeightT, 0.72);
});

test("layout API schema accepts omitted wallHeightT (legacy)", () => {
  const parsed = parseLayoutApiBody(sampleBody(undefined));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.layout.placements[0].wallHeightT, undefined);
});

test("layout API schema rejects wallHeightT outside hang range", () => {
  const tooLow = parseLayoutApiBody(sampleBody(MIN_WALL_HEIGHT_T - 0.01));
  assert.equal(tooLow.ok, false);
  const tooHigh = parseLayoutApiBody(sampleBody(MAX_WALL_HEIGHT_T + 0.01));
  assert.equal(tooHigh.ok, false);
  const okDefault = parseLayoutApiBody(sampleBody(DEFAULT_WALL_HEIGHT_T));
  assert.equal(okDefault.ok, true);
});

test("layout API schema keeps room floorColor/wallColor hex", () => {
  const parsed = parseLayoutApiBody(
    sampleBody(undefined, {
      floorColor: "#5A6068",
      wallColor: "#C4B8A8",
    }),
  );
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.layout.rooms[0].floorColor, "#5a6068");
  assert.equal(parsed.layout.rooms[0].wallColor, "#c4b8a8");
});

test("layout API schema rejects invalid room surface hex", () => {
  const bad = parseLayoutApiBody(
    sampleBody(undefined, { floorColor: "red", wallColor: "#adb0b8" }),
  );
  assert.equal(bad.ok, false);
});

test("layout API schema accepts omitted room colors (legacy)", () => {
  const parsed = parseLayoutApiBody(sampleBody(undefined));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.layout.rooms[0].floorColor, undefined);
  assert.equal(parsed.layout.rooms[0].wallColor, undefined);
});
