import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createDefaultCatalog, normalizeLayout } from "../catalog-types.ts";
import {
  TEST_SCULPTURE_ARTWORK_ID,
  coerceSculptureFloorPlacement,
  ensureTestSculpturePlacement,
  normalizeSculpturePlacements,
  testSculpturePlacementForLayout,
} from "./sculpture-seed.ts";
import { sculpturePoseFromPlacement } from "./painting-pose.ts";
import { GALLERY_FLOOR_RAISE } from "./constants.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "prod-catalog.fixture.json"), "utf8"),
);

describe("sculpture-seed", () => {
  it("places sample box at hexagon room centroid when none exist", () => {
    const layout = normalizeLayout({
      ...fixture.layout,
      placements: (fixture.layout.placements || []).filter(
        (p) => p.kind !== "sculpture",
      ),
    });
    const place = testSculpturePlacementForLayout(layout);
    assert.ok(place);
    assert.equal(place.kind, "sculpture");
    assert.equal(place.artworkId, TEST_SCULPTURE_ARTWORK_ID);
    assert.equal(place.roomId, "bd4eb2e3-e595-4541-bc97-35aff02ce313");
    assert.ok(Number.isFinite(place.floorX));
    assert.ok(Number.isFinite(place.floorZ));
    assert.equal(place.wallEdgeIndex, undefined);
    assert.equal(place.tAlongEdge, undefined);
    assert.equal(place.wallHeightT, undefined);
  });

  it("ensureTestSculpturePlacement is idempotent and skips when present", () => {
    const catalog = structuredClone(fixture);
    catalog.layout.placements = (catalog.layout.placements || []).filter(
      (p) => p.kind !== "sculpture",
    );
    const once = ensureTestSculpturePlacement(catalog);
    const n = once.layout.placements.filter((p) => p.kind === "sculpture").length;
    assert.equal(n, 1);
    const twice = ensureTestSculpturePlacement(once);
    assert.equal(
      twice.layout.placements.filter((p) => p.kind === "sculpture").length,
      1,
    );
  });

  it("sculpture pose sits on raised gallery floor", () => {
    const layout = normalizeLayout(fixture.layout);
    const place =
      layout.placements.find((p) => p.kind === "sculpture") ||
      testSculpturePlacementForLayout(layout);
    assert.ok(place);
    const pose = sculpturePoseFromPlacement(place);
    assert.ok(pose);
    assert.equal(pose.position.y, GALLERY_FLOOR_RAISE);
  });

  it("default catalog includes published sample sculpture assets", () => {
    const catalog = createDefaultCatalog();
    const box = catalog.artworks.find((a) => a.id === TEST_SCULPTURE_ARTWORK_ID);
    assert.ok(box);
    assert.equal(box.type, "model");
    assert.ok(box.modelUrl?.includes("/samples/sculptures/"));
    assert.equal(box.published, true);
  });

  it("prod fixture keeps sample-sculpture-box as floor volume only", () => {
    const place = (fixture.layout.placements || []).find(
      (p) => p.artworkId === TEST_SCULPTURE_ARTWORK_ID,
    );
    assert.ok(place);
    assert.equal(place.kind, "sculpture");
    assert.ok(Number.isFinite(place.floorX));
    assert.ok(Number.isFinite(place.floorZ));
    assert.equal(place.wallEdgeIndex, undefined);
    assert.equal(place.tAlongEdge, undefined);
    assert.equal(place.wallHeightT, undefined);
    const pose = sculpturePoseFromPlacement(place);
    assert.ok(pose);
    assert.equal(pose.position.y, GALLERY_FLOOR_RAISE);
  });

  it("coerceSculptureFloorPlacement strips wallEdge and keeps floor volume", () => {
    const layout = normalizeLayout(fixture.layout);
    const room = layout.rooms.find((r) => r.shape === "hexagon") || layout.rooms[0];
    assert.ok(room);
    const wallHung = {
      artworkId: TEST_SCULPTURE_ARTWORK_ID,
      kind: "painting",
      roomId: room.id,
      wallEdgeIndex: 0,
      tAlongEdge: 0.5,
      wallHeightT: 0.55,
      yaw: 10,
      frameId: "wood",
    };
    const floor = coerceSculptureFloorPlacement(wallHung, layout);
    assert.equal(floor.kind, "sculpture");
    assert.equal(floor.frameId, "none");
    assert.ok(Number.isFinite(floor.floorX));
    assert.ok(Number.isFinite(floor.floorZ));
    assert.equal(floor.wallEdgeIndex, undefined);
    assert.equal(floor.tAlongEdge, undefined);
    assert.equal(floor.wallHeightT, undefined);
    const pose = sculpturePoseFromPlacement(floor);
    assert.ok(pose);
    assert.equal(pose.position.y, GALLERY_FLOOR_RAISE);
  });

  it("normalizeSculpturePlacements repairs type=model painting rows", () => {
    const catalog = structuredClone(fixture);
    const room =
      catalog.layout.rooms.find((r) => r.shape === "hexagon") ||
      catalog.layout.rooms[0];
    catalog.layout.placements = [
      {
        artworkId: TEST_SCULPTURE_ARTWORK_ID,
        kind: "painting",
        roomId: room.id,
        wallEdgeIndex: 1,
        tAlongEdge: 0.4,
        wallHeightT: 0.55,
        yaw: 0,
        frameId: "thin",
      },
    ];
    normalizeSculpturePlacements(catalog);
    const p = catalog.layout.placements.find(
      (x) => x.artworkId === TEST_SCULPTURE_ARTWORK_ID,
    );
    assert.ok(p);
    assert.equal(p.kind, "sculpture");
    assert.ok(Number.isFinite(p.floorX));
    assert.ok(Number.isFinite(p.floorZ));
    assert.equal(p.wallEdgeIndex, undefined);
  });

  it("ensureTestSculpturePlacement repairs wall-hung model without double seed", () => {
    const catalog = structuredClone(fixture);
    const room =
      catalog.layout.rooms.find((r) => r.shape === "hexagon") ||
      catalog.layout.rooms[0];
    catalog.layout.placements = (catalog.layout.placements || [])
      .filter((p) => p.kind !== "sculpture")
      .concat([
        {
          artworkId: TEST_SCULPTURE_ARTWORK_ID,
          kind: "painting",
          roomId: room.id,
          wallEdgeIndex: 2,
          tAlongEdge: 0.55,
          wallHeightT: 0.55,
          yaw: 0,
          frameId: "none",
        },
      ]);
    const out = ensureTestSculpturePlacement(catalog);
    const sculptures = out.layout.placements.filter(
      (p) => p.artworkId === TEST_SCULPTURE_ARTWORK_ID,
    );
    assert.equal(sculptures.length, 1);
    assert.equal(sculptures[0].kind, "sculpture");
    assert.ok(Number.isFinite(sculptures[0].floorX));
    assert.ok(Number.isFinite(sculptures[0].floorZ));
    assert.equal(sculptures[0].wallEdgeIndex, undefined);
  });
});
