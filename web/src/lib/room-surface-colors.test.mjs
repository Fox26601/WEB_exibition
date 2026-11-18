import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_FLOOR_COLOR_HEX,
  DEFAULT_WALL_COLOR_HEX,
  clampHexColor,
  hexLuminance,
  normalizeHexColor,
  parseHexToNumber,
  planRoomSvgColors,
} from "./room-surface-colors.ts";
import { normalizeLayout, normalizeRoom } from "./catalog-types.ts";

test("normalizeHexColor accepts #RGB and #RRGGBB", () => {
  assert.equal(normalizeHexColor("#6e7278"), "#6e7278");
  assert.equal(normalizeHexColor("#ABC"), "#aabbcc");
  assert.equal(normalizeHexColor("not-a-color"), null);
  assert.equal(normalizeHexColor(12), null);
});

test("clampHexColor falls back to gallery defaults", () => {
  assert.equal(clampHexColor(undefined, DEFAULT_FLOOR_COLOR_HEX), "#6e7278");
  assert.equal(clampHexColor("#adb0b8", DEFAULT_WALL_COLOR_HEX), "#adb0b8");
});

test("parseHexToNumber matches FLOOR_COLOR / WALL_COLOR numerics", () => {
  assert.equal(parseHexToNumber(DEFAULT_FLOOR_COLOR_HEX), 0x6e7278);
  assert.equal(parseHexToNumber(DEFAULT_WALL_COLOR_HEX), 0xadb0b8);
});

test("normalizeRoom fills missing floor/wall colors", () => {
  const room = normalizeRoom({
    id: "r1",
    shape: "square",
    transform: { x: 0, z: 4, rotation: 0, scaleX: 3, scaleZ: 3 },
  });
  assert.equal(room.floorColor, DEFAULT_FLOOR_COLOR_HEX);
  assert.equal(room.wallColor, DEFAULT_WALL_COLOR_HEX);
});

test("normalizeLayout keeps custom room colors", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: "r1",
        shape: "hexagon",
        transform: { x: 0, z: 4, rotation: 0, scaleX: 3, scaleZ: 3 },
        floorColor: "#5a6068",
        wallColor: "#c4b8a8",
      },
    ],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  assert.equal(layout.rooms[0].floorColor, "#5a6068");
  assert.equal(layout.rooms[0].wallColor, "#c4b8a8");
});

test("planRoomSvgColors uses floor fill and wall stroke", () => {
  const colors = planRoomSvgColors({
    floorColor: "#5a6068",
    wallColor: "#c4b8a8",
  });
  assert.equal(colors.fill, "#5a6068");
  assert.equal(colors.stroke, "#c4b8a8");
  assert.ok(hexLuminance(colors.fill) < 0.45);
  assert.equal(colors.labelFill, "#e8e4dc");
});

test("planRoomSvgColors defaults and light-floor label contrast", () => {
  const defaults = planRoomSvgColors({});
  assert.equal(defaults.fill, DEFAULT_FLOOR_COLOR_HEX);
  assert.equal(defaults.stroke, DEFAULT_WALL_COLOR_HEX);

  const light = planRoomSvgColors({
    floorColor: "#c4b8a8",
    wallColor: "#5a6068",
  });
  assert.equal(light.labelFill, "#2a2620");
});
