import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { createDefaultCatalog, normalizeLayout } from "../catalog-types.ts";
import {
  TEST_SCULPTURE_ARTWORK_ID,
  ensureTestSculpturePlacement,
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
});
