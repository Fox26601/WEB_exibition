import type {
  Artwork,
  ArtworkPlacement,
  Catalog,
  GalleryLayout,
} from "@/lib/catalog-types";
import { normalizeLayout } from "@/lib/catalog-types";
import {
  edgePoints,
  inwardNormal,
  pointAlongEdge,
  roomCentroid,
  roomWorldVertices,
} from "@/lib/layout-geometry";

/** Sample GLB used as the visitor floor test sculpture. */
export const TEST_SCULPTURE_ARTWORK_ID = "sample-sculpture-box";

/** Pull mis-hung wall coords inward so the volume stands in the room, not on the face. */
const WALL_TO_FLOOR_INSET = 1.25;

function isModelArtwork(
  art: Artwork | undefined,
  placement: ArtworkPlacement,
): boolean {
  return art?.type === "model" || placement.kind === "sculpture";
}

/**
 * Force a placement onto the gallery floor: kind=sculpture + floorX/floorZ only.
 * Never keeps wallEdge / tAlongEdge / wallHeightT (those are painting-only).
 */
export function coerceSculptureFloorPlacement(
  placement: ArtworkPlacement,
  layout: GalleryLayout,
): ArtworkPlacement {
  const rooms = normalizeLayout(layout).rooms;
  const room =
    rooms.find((r) => r.id === placement.roomId) ??
    rooms.find((r) => r.shape === "hexagon") ??
    rooms.find((r) => r.shape === "square") ??
    rooms[0];

  let floorX =
    typeof placement.floorX === "number" && Number.isFinite(placement.floorX)
      ? placement.floorX
      : null;
  let floorZ =
    typeof placement.floorZ === "number" && Number.isFinite(placement.floorZ)
      ? placement.floorZ
      : null;

  if ((floorX == null || floorZ == null) && room) {
    const verts = roomWorldVertices(room);
    if (
      verts.length >= 2 &&
      placement.wallEdgeIndex != null &&
      placement.tAlongEdge != null
    ) {
      const edgeIdx =
        ((placement.wallEdgeIndex % verts.length) + verts.length) %
        verts.length;
      const [a, b] = edgePoints(verts, edgeIdx);
      const along = pointAlongEdge(
        a,
        b,
        Math.max(0, Math.min(1, placement.tAlongEdge)),
      );
      const centroid = roomCentroid(verts);
      const inward = inwardNormal(a, b, centroid);
      floorX = along.x + inward.x * WALL_TO_FLOOR_INSET;
      floorZ = along.z + inward.z * WALL_TO_FLOOR_INSET;
    } else if (verts.length >= 3) {
      const c = roomCentroid(verts);
      floorX = c.x;
      floorZ = c.z;
    }
  }

  if (floorX == null || floorZ == null) {
    floorX = 0;
    floorZ = 0;
  }

  return {
    artworkId: placement.artworkId,
    kind: "sculpture",
    roomId: room?.id ?? placement.roomId,
    floorX,
    floorZ,
    yaw: placement.yaw ?? 0,
    frameId: "none",
  };
}

/**
 * Any type=model (or kind=sculpture) placement becomes a floor volume —
 * repairs legacy wallEdge / painting-kind rows in live/draft catalogs.
 */
export function normalizeSculpturePlacements(catalog: Catalog): Catalog {
  const layout = normalizeLayout(catalog.layout);
  const byId = new Map(catalog.artworks.map((a) => [a.id, a]));
  const placements = layout.placements.map((p) => {
    if (!isModelArtwork(byId.get(p.artworkId), p)) return p;
    return coerceSculptureFloorPlacement(p, layout);
  });
  catalog.layout = { ...layout, placements };
  return catalog;
}

function hasFloorSculpture(placements: ArtworkPlacement[]): boolean {
  return placements.some(
    (p) =>
      p.kind === "sculpture" &&
      typeof p.floorX === "number" &&
      typeof p.floorZ === "number" &&
      Number.isFinite(p.floorX) &&
      Number.isFinite(p.floorZ),
  );
}

/**
 * Normalize all model/sculpture rows to floorX/floorZ, then when a layout has
 * rooms but still no floor sculpture, place the sample box at the preferred
 * room centroid so look-at / View / Booklet can be exercised.
 */
export function ensureTestSculpturePlacement(catalog: Catalog): Catalog {
  normalizeSculpturePlacements(catalog);
  const layout = normalizeLayout(catalog.layout);
  if (layout.rooms.length === 0) {
    catalog.layout = layout;
    return catalog;
  }
  if (hasFloorSculpture(layout.placements)) {
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

  // Drop any leftover wall/painting rows for this artwork before seeding.
  const others = layout.placements.filter((p) => p.artworkId !== art.id);
  catalog.layout = {
    ...layout,
    placements: [...others, placement],
  };
  return catalog;
}

/** Build a floor placement at the preferred room centroid (never wallEdge). */
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
