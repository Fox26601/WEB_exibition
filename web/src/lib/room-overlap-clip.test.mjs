import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import {
  layoutOverlapRooms,
  shouldKeepFloorTriangle,
  wallSpansForEdge,
  wallSpansForRoom,
} from "./room-overlap-clip.ts";
import { pointInPolygon, roomWorldVertices } from "./layout-geometry.ts";

function roomCentroid(verts) {
  let x = 0;
  let z = 0;
  for (const v of verts) {
    x += v.x;
    z += v.z;
  }
  return { x: x / verts.length, z: z / verts.length };
}

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

test("shouldKeepFloorTriangle keeps overlap when inner room has lower id (outer ring)", () => {
  const layout = normalizeLayout({
    rooms: [
      squareRoom("alpha", 0, 0, 6),
      squareRoom("zoo", 0, 0, 2.5),
    ],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -4, rotation: 0 },
  });
  const rooms = layoutOverlapRooms(layout);
  const outer = layout.rooms.find((r) => r.id === "alpha");
  const inner = layout.rooms.find((r) => r.id === "zoo");
  assert.ok(outer && inner);

  const overlapCentroid = roomWorldVertices(inner)[0];
  assert.ok(pointInPolygon(overlapCentroid, roomWorldVertices(outer)));
  assert.ok(
    shouldKeepFloorTriangle(rooms, "alpha", overlapCentroid),
    "outer floor must stay in overlap even when inner id sorts lower",
  );
  assert.ok(
    shouldKeepFloorTriangle(rooms, "zoo", roomCentroid(roomWorldVertices(inner))),
    "inner room keeps its floor",
  );
});

test("shouldKeepFloorTriangle keeps all room triangles at overlap centroids", () => {
  const layout = normalizeLayout({
    rooms: [hexRoom("hex", 0, 2), squareRoom("sq", 0.5, 1.8, 2.2, 45)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const rooms = layoutOverlapRooms(layout);
  const sqVerts = roomWorldVertices(layout.rooms.find((r) => r.id === "sq"));
  const c = roomCentroid(sqVerts);
  assert.ok(shouldKeepFloorTriangle(rooms, "sq", c));
  assert.ok(shouldKeepFloorTriangle(rooms, "hex", c));
});