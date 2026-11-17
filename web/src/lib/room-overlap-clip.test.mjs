import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import {
  layoutOverlapRooms,
  wallSpansForEdge,
  wallSpansForRoom,
} from "./room-overlap-clip.ts";

function squareRoom(id, x, z, scale = 2.4, rotation = 0) {
  return {
    id,
    shape: "square",
    transform: { x, z, rotation, scaleX: scale, scaleZ: scale },
  };
}

function hexRoom(id, x, z, scale = 2.8) {
  return {
    id,
    shape: "hexagon",
    transform: { x, z, rotation: 0, scaleX: scale, scaleZ: scale },
  };
}

test("wallSpansForEdge drops spans with midpoints inside another room", () => {
  const layout = normalizeLayout({
    rooms: [
      hexRoom("hex", 0, 2),
      squareRoom("sq", 0.5, 1.8, 2.2, 45),
    ],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const rooms = layoutOverlapRooms(layout);
  const sq = rooms.find((r) => r.id === "sq");
  assert.ok(sq);

  let removed = 0;
  for (let e = 0; e < sq.verts.length; e++) {
    const clipped = wallSpansForEdge(rooms, "sq", e);
    if (clipped.length === 0) removed++;
  }
  assert.ok(removed > 0, "square fully inside hex should drop all interior wall spans");
});

test("wallSpansForRoom is empty for unknown room", () => {
  assert.deepEqual(wallSpansForRoom([], "nope"), []);
});