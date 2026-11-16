import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import { DEFAULT_WALL_HEIGHT_T } from "./catalog-types.ts";
import {
  evaluateArtworkDrop,
  MAX_WALL_SNAP_DIST,
  placementWorldPoint,
  resolvedWallHeightT,
} from "./placement-eval.ts";

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
  const drop = evaluateArtworkDrop(art, nearWall, layout, "metal");
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
  const miss = evaluateArtworkDrop(art, far, layout, "wood");
  assert.equal(miss.ok, false);
  if (miss.ok) return;
  assert.equal(miss.reason, "no_snap");
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
  const conflict = evaluateArtworkDrop(art, nearWall, layout, "wood");
  assert.equal(conflict.ok, false);
  if (conflict.ok) return;
  assert.equal(conflict.reason, "conflict");
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