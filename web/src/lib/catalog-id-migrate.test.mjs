import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  catalogNeedsIdMigration,
  catalogNeedsNumericBookletMigration,
  migrateCatalogIds,
} from "./catalog-id-migrate.ts";
import {
  createDefaultCatalog,
  normalizeLayout,
} from "./catalog-types.ts";

describe("catalog ID migration", () => {
  it("detects legacy booklet keys", () => {
    const catalog = createDefaultCatalog();
    catalog.settings.entrance.booklet[0].key = "intro";
    assert.equal(catalogNeedsNumericBookletMigration(catalog), true);
    assert.equal(catalogNeedsIdMigration(catalog), true);
  });

  it("drops placements with missing artworkId and unknown rooms", () => {
    const catalog = createDefaultCatalog();
    const roomId = "room-keep";
    catalog.layout = normalizeLayout({
      rooms: [
        {
          id: roomId,
          shape: "square",
          transform: { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
        },
      ],
      connections: [
        {
          roomA: roomId,
          roomB: "missing-room",
          edgeA: 0,
          edgeB: 0,
          doorwayWidth: 1,
        },
      ],
      placements: [
        {
          artworkId: "sample-01",
          kind: "painting",
          roomId,
          wallEdgeIndex: 0,
          tAlongEdge: 0.5,
          yaw: 0,
          frameId: "wood",
        },
        {
          artworkId: "ghost-art",
          kind: "painting",
          roomId,
          wallEdgeIndex: 1,
          tAlongEdge: 0.2,
          yaw: 0,
          frameId: "thin",
        },
        {
          artworkId: "sample-02",
          kind: "sculpture",
          roomId: "gone-room",
          floorX: 0,
          floorZ: 0,
          yaw: 0,
          frameId: "none",
        },
      ],
      entrance: { x: 0, z: -2, rotation: 0 },
    });

    assert.equal(catalogNeedsIdMigration(catalog), true);
    migrateCatalogIds(catalog);

    assert.equal(catalog.layout.placements.length, 1);
    assert.equal(catalog.layout.placements[0].artworkId, "sample-01");
    assert.equal(catalog.layout.connections.length, 0);
    assert.equal(catalogNeedsIdMigration(catalog), false);
  });

  it("reindexes non-contiguous artwork.sort", () => {
    const catalog = createDefaultCatalog();
    catalog.artworks[0].sort = 10;
    catalog.artworks[1].sort = 20;
    assert.equal(catalogNeedsIdMigration(catalog), true);
    migrateCatalogIds(catalog);
    catalog.artworks.forEach((a, i) => {
      assert.equal(a.sort, i);
    });
    assert.equal(catalogNeedsIdMigration(catalog), false);
  });
});
