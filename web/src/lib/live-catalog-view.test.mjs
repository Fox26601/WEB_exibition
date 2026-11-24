import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultCatalog, emptyLayout } from "./catalog-types.ts";
import { liveCatalogView, publicArtworks } from "./live-catalog-view.ts";

describe("publicArtworks / liveCatalogView", () => {
  it("keeps only published===true artworks", () => {
    const catalog = createDefaultCatalog();
    catalog.artworks = [
      {
        ...catalog.artworks[0],
        id: "pub",
        published: true,
      },
      {
        ...catalog.artworks[0],
        id: "draft",
        published: false,
      },
      {
        ...catalog.artworks[0],
        id: "missing-flag",
        // @ts-expect-error intentional legacy row without published
        published: undefined,
      },
    ];

    const ids = publicArtworks(catalog).map((a) => a.id);
    assert.deepEqual(ids, ["pub"]);
  });

  it("drops placements for unpublished artworks from the live view", () => {
    const catalog = createDefaultCatalog();
    catalog.artworks = [
      { ...catalog.artworks[0], id: "keep", published: true, type: "image" },
      { ...catalog.artworks[0], id: "hide", published: false, type: "video" },
    ];
    catalog.layout = {
      ...emptyLayout(),
      rooms: [
        {
          id: "r1",
          shape: "square",
          transform: { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
        },
      ],
      placements: [
        {
          artworkId: "keep",
          roomId: "r1",
          kind: "painting",
          wallEdge: 0,
          t: 0.5,
          height: 1.55,
          yaw: 0,
          frameId: "wood",
        },
        {
          artworkId: "hide",
          roomId: "r1",
          kind: "painting",
          wallEdge: 1,
          t: 0.5,
          height: 1.55,
          yaw: 0,
          frameId: "wood",
        },
      ],
    };

    const live = liveCatalogView(catalog);
    assert.deepEqual(
      live.artworks.map((a) => a.id),
      ["keep"],
    );
    assert.deepEqual(
      live.layout?.placements.map((p) => p.artworkId),
      ["keep"],
    );
  });
});
