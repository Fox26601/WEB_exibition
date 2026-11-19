import type { ArtworkPlacement, Catalog, GalleryLayout } from "@/lib/catalog-types";
import { normalizeLayout } from "@/lib/catalog-types";
import { roomCentroid, roomWorldVertices } from "@/lib/layout-geometry";

/** Sample GLB used as the visitor floor test sculpture. */
export const TEST_SCULPTURE_ARTWORK_ID = "sample-sculpture-box";

/**
 * When a layout has rooms but no floor sculptures, place the sample box at
 * the first room centroid so look-at / View / Booklet can be exercised.
 * Skips if any sculpture placement already exists.
 */
export function ensureTestSculpturePlacement(catalog: Catalog): Catalog {
  const layout = normalizeLayout(catalog.layout);
  if (layout.rooms.length === 0) return catalog;
  if (layout.placements.some((p) => p.kind === "sculpture")) {
    catalog.layout = layout;
    return catalog;
  }

  const art = catalog.artworks.find(
    (a) =>
      a.id === TEST_SCULPTURE_ARTWORK_ID &&
      a.type === "model" &&
      a.published &&
      !!a.modelUrl?.trim(),
  );
  if (!art) {
    catalog.layout = layout;
    return catalog;
  }

  const placement = testSculpturePlacementForLayout(layout, art.id);
  if (!placement) {
    catalog.layout = layout;
    return catalog;
  }

  catalog.layout = {
    ...layout,
    placements: [...layout.placements, placement],
  };
  return catalog;
}

/** Build a floor placement at the preferred room centroid. */
export function testSculpturePlacementForLayout(
  layout: GalleryLayout,
  artworkId = TEST_SCULPTURE_ARTWORK_ID,
): ArtworkPlacement | null {
  const rooms = normalizeLayout(layout).rooms;
  if (rooms.length === 0) return null;
  // Prefer hexagon (foyer-connected hall in prod fixture), else first room.
  const room =
    rooms.find((r) => r.shape === "hexagon") ??
    rooms.find((r) => r.shape === "square") ??
    rooms[0]!;
  const verts = roomWorldVertices(room);
  if (verts.length < 3) return null;
  const c = roomCentroid(verts);
  return {
    artworkId,
    kind: "sculpture",
    roomId: room.id,
    floorX: c.x,
    floorZ: c.z,
    yaw: 25,
    frameId: "none",
  };
}
