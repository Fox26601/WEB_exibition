import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import { DEFAULT_WALL_HEIGHT_T } from "./catalog-types.ts";
import {
  evaluateArtworkDrop,
  MAX_WALL_SNAP_DIST,
  placementWorldPoint,
  resolvedWallHeightT,
  syncPaintingYaws,
} from "./placement-eval.ts";
import {
  edgePoints,
  roomCentroid,
  roomWorldVertices,
  yawFromEdge,
} from "./layout-geometry.ts";

function squareRoom(id, x, z, scale = 3.2) {
  return {
    id,
    shape: "square",
    transform: { x, z, rotation: 0, scaleX: scale, scaleZ: scale },
  };
}

test("evaluateArtworkDrop snaps painting to nearest wall within range", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "a1",
    type: "image",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
    frameId: "wood",
  };

  const nearWall = { x: 0, z: 6.26 + 0.45 };
  const drop = evaluateArtworkDrop(art, nearWall, layout);
  assert.equal(drop.ok, true);
  if (!drop.ok) return;
  assert.equal(drop.placement.kind, "painting");
  assert.equal(drop.placement.roomId, "r1");
  assert.equal(drop.placement.frameId, "wood");
  assert.equal(drop.placement.wallHeightT, DEFAULT_WALL_HEIGHT_T);
  assert.ok(
    (drop.placement.tAlongEdge ?? 0) >= 0.12 &&
      (drop.placement.tAlongEdge ?? 0) <= 0.88,
  );

  const far = { x: 0, z: 6.26 + MAX_WALL_SNAP_DIST + 0.5 };
  const miss = evaluateArtworkDrop(art, far, layout);
  assert.equal(miss.ok, false);
  if (miss.ok) return;
  assert.equal(miss.reason, "no_snap");
});

test("evaluateArtworkDrop snaps painting from room center to nearest wall", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "a-center",
    type: "image",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
    frameId: "wood",
  };

  const center = { x: 0, z: 4 };
  const drop = evaluateArtworkDrop(art, center, layout);
  assert.equal(drop.ok, true, "room-center drop must snap to a wall");
  if (!drop.ok) return;
  assert.equal(drop.placement.kind, "painting");
  assert.equal(drop.placement.roomId, "r1");
  assert.ok(drop.placement.wallEdgeIndex != null);
});

test("evaluateArtworkDrop places sculpture on floor inside room", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "s1",
    type: "model",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
    modelUrl: "/samples/sculptures/box.glb",
    frameId: "none",
  };

  const floor = { x: 0.5, z: 4.2 };
  const drop = evaluateArtworkDrop(art, floor, layout);
  assert.equal(drop.ok, true);
  if (!drop.ok) return;
  assert.equal(drop.placement.kind, "sculpture");
  assert.equal(drop.placement.floorX, floor.x);
  assert.equal(drop.placement.floorZ, floor.z);

  const outside = { x: 50, z: 50 };
  const miss = evaluateArtworkDrop(art, outside, layout);
  assert.equal(miss.ok, false);
  if (miss.ok) return;
  assert.equal(miss.reason, "no_room");
});

test("evaluateArtworkDrop detects painting conflicts on same wall segment", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [
      {
        artworkId: "existing",
        kind: "painting",
        roomId: "r1",
        wallEdgeIndex: 0,
        tAlongEdge: 0.5,
        yaw: 0,
        frameId: "wood",
      },
    ],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "a2",
    type: "image",
    sort: 1,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
  };

  const nearWall = { x: 0.2, z: 6.26 + 0.35 };
  const conflict = evaluateArtworkDrop(art, nearWall, layout);
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.reason, "conflict");
});

test("evaluateArtworkDrop ignoreArtworkId skips self conflict on re-drop", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [
      {
        artworkId: "existing",
        kind: "painting",
        roomId: "r1",
        wallEdgeIndex: 0,
        tAlongEdge: 0.5,
        yaw: 0,
        frameId: "wood",
      },
    ],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "existing",
    type: "image",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
    frameId: "metal",
  };

  const nearWall = { x: 0.2, z: 6.26 + 0.35 };
  const again = evaluateArtworkDrop(art, nearWall, layout, "existing");
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.placement.frameId, "metal");
});

test("evaluateArtworkDrop defaults painting frame to wood without catalog frameId", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "a-default-frame",
    type: "image",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
  };

  const nearWall = { x: 0, z: 6.26 + 0.45 };
  const drop = evaluateArtworkDrop(art, nearWall, layout);
  assert.equal(drop.ok, true);
  if (!drop.ok) return;
  assert.equal(drop.placement.frameId, "wood");
});

test("placementWorldPoint resolves sculpture floor and painting wall", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const sculpturePt = placementWorldPoint(
    {
      artworkId: "s1",
      kind: "sculpture",
      roomId: "r1",
      floorX: 1,
      floorZ: 5,
      yaw: 0,
      frameId: "none",
    },
    layout,
  );
  assert.deepEqual(sculpturePt, { x: 1, z: 5 });

  const paintingPt = placementWorldPoint(
    {
      artworkId: "p1",
      kind: "painting",
      roomId: "r1",
      wallEdgeIndex: 0,
      tAlongEdge: 0.5,
      yaw: 0,
      frameId: "wood",
    },
    layout,
  );
  assert.ok(paintingPt);
  assert.ok(Math.abs(paintingPt.x) < 0.01 || Math.abs(paintingPt.z - 4) < 0.5);
});

test("painting yaw uses centroid-based inward normal", () => {
  const layout = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const room = layout.rooms[0];
  const verts = roomWorldVertices(room);
  const centroid = roomCentroid(verts);
  const [a, b] = edgePoints(verts, 0);
  const correct = yawFromEdge(a, b, true, centroid);
  const naive = yawFromEdge(a, b, true);
  assert.ok(
    Math.abs(Math.abs(correct - naive) - 180) < 0.01 ||
      Math.abs(correct - naive) < 0.01,
    "centroid yaw should match inward normal or differ by 180 from naive flip",
  );

  const withWrongYaw = {
    ...layout,
    placements: [
      {
        artworkId: "p1",
        kind: "painting",
        roomId: "r1",
        wallEdgeIndex: 0,
        tAlongEdge: 0.5,
        yaw: naive,
        frameId: "wood",
      },
    ],
  };
  const fixed = syncPaintingYaws(withWrongYaw);
  assert.ok(Math.abs(fixed.placements[0].yaw - correct) < 0.02);
});

test("resolvedWallHeightT defaults and clamps", () => {
  assert.equal(
    resolvedWallHeightT({
      artworkId: "a",
      kind: "painting",
      roomId: "r",
      yaw: 0,
      frameId: "wood",
    }),
    DEFAULT_WALL_HEIGHT_T,
  );
  assert.equal(
    resolvedWallHeightT({
      artworkId: "a",
      kind: "painting",
      roomId: "r",
      yaw: 0,
      frameId: "wood",
      wallHeightT: 0.7,
    }),
    0.7,
  );
});

test("evaluateArtworkDrop refuses painting in doorway span", () => {
  const base = normalizeLayout({
    rooms: [squareRoom("r1", 0, 4)],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });

  const art = {
    id: "door-art",
    type: "image",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
    frameId: "wood",
  };

  const probe = { x: 0, z: 6.26 + 0.35 };
  const open = evaluateArtworkDrop(art, probe, base);
  assert.equal(open.ok, true);
  if (!open.ok) return;
  const edgeIndex = open.placement.wallEdgeIndex;
  assert.ok(edgeIndex != null);

  const withDoor = normalizeLayout({
    ...base,
    connections: [
      {
        roomA: "r1",
        roomB: "entrance",
        edgeA: edgeIndex,
        edgeB: 2,
        doorwayWidth: 4,
      },
    ],
  });

  const blocked = evaluateArtworkDrop(art, probe, withDoor);
  assert.equal(blocked.ok, false);
  if (blocked.ok) return;
  assert.equal(blocked.reason, "doorway");
});