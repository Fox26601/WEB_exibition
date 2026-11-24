import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDefaultCatalog,
  emptyLayout,
  normalizeLayout,
} from "./catalog-types.ts";
import { normalizeLoadedCatalog } from "./catalog.ts";
import { TEST_SCULPTURE_ARTWORK_ID } from "./gallery-three/sculpture-seed.ts";
import { artworkThumbUrl, artworkTypeChip } from "./artwork-thumb.ts";
import {
  artworkMediaPathnames,
  blobPathnameFromUrl,
} from "./blob-pathname.ts";

describe("normalizeLoadedCatalog sample persistence", () => {
  it("does not re-inject deleted sample sculptures", () => {
    const catalog = createDefaultCatalog();
    catalog.artworks = catalog.artworks.filter(
      (a) => a.id !== TEST_SCULPTURE_ARTWORK_ID,
    );
    catalog.layout = {
      ...normalizeLayout(catalog.layout),
      rooms: [
        {
          id: "room-1",
          shape: "square",
          transform: { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
        },
      ],
      placements: [],
    };

    const next = normalizeLoadedCatalog(structuredClone(catalog));
    assert.equal(
      next.artworks.some((a) => a.id === TEST_SCULPTURE_ARTWORK_ID),
      false,
    );
    assert.equal(
      next.layout.placements.some(
        (p) => p.artworkId === TEST_SCULPTURE_ARTWORK_ID,
      ),
      false,
    );
  });

  it("does not auto-place Stub Box when artwork exists but floor is empty", () => {
    const catalog = createDefaultCatalog();
    catalog.layout = {
      ...emptyLayout(),
      rooms: [
        {
          id: "room-1",
          shape: "hexagon",
          transform: { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
        },
      ],
      placements: [],
    };

    const next = normalizeLoadedCatalog(structuredClone(catalog));
    assert.ok(next.artworks.some((a) => a.id === TEST_SCULPTURE_ARTWORK_ID));
    assert.equal(
      next.layout.placements.filter((p) => p.kind === "sculpture").length,
      0,
    );
  });

  it("backfills empty sample media URLs for remaining samples", () => {
    const catalog = createDefaultCatalog();
    const box = catalog.artworks.find((a) => a.id === TEST_SCULPTURE_ARTWORK_ID);
    assert.ok(box);
    box.modelUrl = "";
    box.urlPoster = "";
    const next = normalizeLoadedCatalog(catalog);
    const fixed = next.artworks.find((a) => a.id === TEST_SCULPTURE_ARTWORK_ID);
    assert.ok(fixed?.modelUrl?.includes("/samples/sculptures/box.glb"));
    assert.ok(fixed?.urlPoster?.includes("/samples/sculptures/box.webp"));
  });

  it("createDefaultCatalog still seeds samples on empty create", () => {
    const catalog = createDefaultCatalog();
    const ids = catalog.artworks
      .filter((a) => a.type === "model")
      .map((a) => a.id);
    assert.deepEqual(ids, [
      "sample-sculpture-box",
      "sample-sculpture-obelisk",
      "sample-sculpture-plinth",
    ]);
    for (const id of ids) {
      const art = catalog.artworks.find((a) => a.id === id);
      assert.ok(art?.urlPoster?.endsWith(".webp"));
    }
  });
});

describe("artworkThumbUrl", () => {
  it("prefers poster for models and never returns empty wall as model thumb", () => {
    assert.equal(
      artworkThumbUrl({
        type: "model",
        urlWall: "",
        urlFull: "",
        urlPoster: "/samples/sculptures/box.webp",
        modelUrl: "/samples/sculptures/box.glb",
      }),
      "/samples/sculptures/box.webp",
    );
    assert.equal(
      artworkThumbUrl({
        type: "model",
        urlWall: "",
        urlFull: "",
        urlPoster: "",
        modelUrl: "/x.glb",
      }),
      "",
    );
    assert.equal(artworkTypeChip("model"), "3D");
    assert.equal(artworkTypeChip("video"), "VID");
  });

  it("uses wall/poster for images and videos", () => {
    assert.equal(
      artworkThumbUrl({
        type: "image",
        urlWall: "/a.webp",
        urlFull: "/b.webp",
        urlPoster: "",
      }),
      "/a.webp",
    );
    assert.equal(
      artworkThumbUrl({
        type: "video",
        urlWall: "",
        urlFull: "",
        urlPoster: "/poster.webp",
      }),
      "/poster.webp",
    );
  });
});

describe("blobPathnameFromUrl", () => {
  it("parses local-media and skips static samples", () => {
    assert.equal(
      blobPathnameFromUrl("/api/local-media?path=uploads%2Fmodel%2Fx.glb"),
      "uploads/model/x.glb",
    );
    assert.equal(blobPathnameFromUrl("/samples/sculptures/box.glb"), null);
    assert.deepEqual(
      artworkMediaPathnames({
        urlWall: "/samples/sample-01.jpg",
        modelUrl: "/api/local-media?path=uploads%2Fmodel%2Fa.glb",
        urlPoster: "/api/local-media?path=uploads%2Fimage%2Fp.webp",
      }),
      ["uploads/image/p.webp", "uploads/model/a.glb"],
    );
  });
});
