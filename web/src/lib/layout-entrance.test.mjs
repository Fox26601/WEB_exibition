import assert from "node:assert/strict";
import test from "node:test";
import { ENTRANCE_ROOM_ID, normalizeLayout } from "./catalog-types.ts";

test("normalizeLayout strips synthetic entrance from rooms", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: ENTRANCE_ROOM_ID,
        shape: "square",
        transform: { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
      },
      {
        id: "room-a",
        shape: "hexagon",
        transform: { x: 2, z: 4, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
      },
    ],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  assert.equal(layout.rooms.length, 1);
  assert.equal(layout.rooms[0].id, "room-a");
  assert.equal(layout.entrance.z, -2);
});