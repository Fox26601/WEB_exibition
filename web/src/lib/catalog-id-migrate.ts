import {
  ENTRANCE_ROOM_ID,
  isNumericBookletPageKey,
  normalizeLayout,
  type Catalog,
  type GalleryLayout,
} from "./catalog-types";

/**
 * True when booklet keys, placement/room refs, or sort indices need a
 * normalize+persist pass so stubs and layout refs stay aligned.
 */
export function catalogNeedsIdMigration(catalog: Catalog): boolean {
  if (catalogNeedsNumericBookletMigration(catalog)) return true;
  if (catalogHasDanglingRefs(catalog)) return true;
  if (catalogHasNonContiguousSort(catalog)) return true;
  return false;
}

/** True when any booklet page still uses a legacy free-text key. */
export function catalogNeedsNumericBookletMigration(
  catalog: Catalog,
): boolean {
  const entrance = catalog.settings?.entrance?.booklet;
  if (Array.isArray(entrance)) {
    for (const page of entrance) {
      if (!isNumericBookletPageKey(page?.key)) return true;
    }
  }
  for (const art of catalog.artworks ?? []) {
    if (!Array.isArray(art.booklet)) continue;
    for (const page of art.booklet) {
      if (!isNumericBookletPageKey(page?.key)) return true;
    }
  }
  return false;
}

export function catalogHasDanglingRefs(catalog: Catalog): boolean {
  const artworkIds = new Set(
    (catalog.artworks ?? []).map((a) => a.id).filter(Boolean),
  );
  const layout = normalizeLayout(catalog.layout);
  const roomIds = new Set(layout.rooms.map((r) => r.id).filter(Boolean));

  for (const p of layout.placements) {
    if (!p?.artworkId || !artworkIds.has(p.artworkId)) return true;
    if (
      p.roomId &&
      p.roomId !== ENTRANCE_ROOM_ID &&
      !roomIds.has(p.roomId)
    ) {
      return true;
    }
  }

  for (const c of layout.connections) {
    if (!c) return true;
    const aOk =
      c.roomA === ENTRANCE_ROOM_ID || roomIds.has(c.roomA);
    const bOk =
      c.roomB === ENTRANCE_ROOM_ID || roomIds.has(c.roomB);
    if (!aOk || !bOk) return true;
  }

  return false;
}

export function catalogHasNonContiguousSort(catalog: Catalog): boolean {
  const arts = catalog.artworks ?? [];
  for (let i = 0; i < arts.length; i++) {
    if (arts[i]?.sort !== i) return true;
  }
  return false;
}

/**
 * Align artwork / placement / room / booklet IDs:
 * - drop placements whose artworkId is missing
 * - drop placements / connections that point at unknown rooms
 * - reindex artwork.sort to 0..n-1
 * - booklet keys remapped by normalizeLoadedCatalog / normalizeSettings
 *
 * Mutates and returns the same catalog object.
 */
export function migrateCatalogIds(catalog: Catalog): Catalog {
  const artworkIds = new Set(
    catalog.artworks.map((a) => a.id).filter((id) => typeof id === "string" && id),
  );
  const layout = normalizeLayout(catalog.layout);
  const roomIds = new Set(layout.rooms.map((r) => r.id).filter(Boolean));

  const placements = layout.placements.filter((p) => {
    if (!p?.artworkId || !artworkIds.has(p.artworkId)) return false;
    if (!p.roomId) return false;
    if (p.roomId === ENTRANCE_ROOM_ID) return true;
    return roomIds.has(p.roomId);
  });

  const connections = layout.connections.filter((c) => {
    if (!c?.roomA || !c?.roomB) return false;
    const aOk = c.roomA === ENTRANCE_ROOM_ID || roomIds.has(c.roomA);
    const bOk = c.roomB === ENTRANCE_ROOM_ID || roomIds.has(c.roomB);
    return aOk && bOk;
  });

  const nextLayout: GalleryLayout = {
    ...layout,
    placements,
    connections,
  };
  catalog.layout = nextLayout;

  catalog.artworks.forEach((a, i) => {
    a.sort = i;
  });

  return catalog;
}
