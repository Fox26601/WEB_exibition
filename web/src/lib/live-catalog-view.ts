import {
  normalizeLayout,
  type Artwork,
  type Catalog,
} from "./catalog-types";

export function publicArtworks(catalog: Catalog): Artwork[] {
  return catalog.artworks
    .filter((a) => a.published === true)
    .sort((a, b) => a.sort - b.sort);
}

/**
 * Live exhibition view: only published artworks and their placements.
 * Unpublish flips published=false on draft; after Publish catalog, this view
 * drops those works from the wall (placements included).
 */
export function liveCatalogView(catalog: Catalog): Catalog {
  const arts = publicArtworks(catalog);
  const pubIds = new Set(arts.map((a) => a.id));
  const layout = catalog.layout
    ? {
        ...normalizeLayout(catalog.layout),
        placements: (catalog.layout.placements || []).filter((p) =>
          pubIds.has(p.artworkId),
        ),
      }
    : catalog.layout;
  return { ...catalog, artworks: arts, layout };
}
