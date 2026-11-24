import {
  createDefaultCatalog,
  emptyLayout,
  normalizeLayout,
  normalizeSettings,
  type Catalog,
  type Artwork,
  type CatalogSettings,
  type GalleryLayout,
} from "./catalog-types";
import { deleteBlob, readBlobText, writeBlobText } from "./blob-store";
import { artworkMediaPathnames } from "./blob-pathname";
import { syncPaintingYaws } from "./placement-eval";
import { normalizeSculpturePlacements } from "./gallery-three/sculpture-seed";

const LIVE_KEY = "catalog-live.json";
const DRAFT_KEY = "catalog-draft.json";

export type CatalogKind = "live" | "draft";

function keyFor(kind: CatalogKind): string {
  return kind === "live" ? LIVE_KEY : DRAFT_KEY;
}

export async function loadCatalog(kind: CatalogKind): Promise<Catalog> {
  try {
    const raw = await readBlobText(keyFor(kind));
    if (!raw) {
      const empty = createDefaultCatalog();
      if (kind === "draft") {
        const live = await readBlobText(LIVE_KEY);
        if (live) {
          try {
            return normalizeLoadedCatalog(JSON.parse(live) as Catalog);
          } catch {
            /* fall through */
          }
        }
      }
      await saveCatalogBestEffort(kind, empty);
      return empty;
    }
    try {
      return normalizeLoadedCatalog(JSON.parse(raw) as Catalog);
    } catch {
      return createDefaultCatalog();
    }
  } catch {
    return createDefaultCatalog();
  }
}

async function saveCatalogBestEffort(
  kind: CatalogKind,
  catalog: Catalog,
): Promise<void> {
  try {
    await saveCatalog(kind, catalog);
  } catch {
    /* first-boot seed may fail on read-only FS; caller still gets in-memory catalog */
  }
}

/**
 * Normalize layout/settings and backfill empty media URLs for sample artworks
 * that still exist. Does NOT re-inject deleted sample sculptures or auto-place
 * Stub Box — those only appear via createDefaultCatalog on first empty create.
 */
export function normalizeLoadedCatalog(catalog: Catalog): Catalog {
  const defaults = createDefaultCatalog();
  catalog.layout = syncPaintingYaws(normalizeLayout(catalog.layout));
  catalog.settings = normalizeSettings(catalog.settings);
  const byId = new Map(defaults.artworks.map((a) => [a.id, a]));
  for (const art of catalog.artworks) {
    const sample = byId.get(art.id);
    if (!sample) continue;
    if (!art.urlWall && sample.urlWall) art.urlWall = sample.urlWall;
    if (!art.urlFull && sample.urlFull) art.urlFull = sample.urlFull;
    if (!art.urlPoster && sample.urlPoster) art.urlPoster = sample.urlPoster;
    if (!art.modelUrl && sample.modelUrl) art.modelUrl = sample.modelUrl;
    if (!art.frameId && sample.frameId) art.frameId = sample.frameId;
  }
  catalog.artworks.sort((a, b) => a.sort - b.sort);
  normalizeSculpturePlacements(catalog);
  return catalog;
}

/** @deprecated Use normalizeLoadedCatalog — kept for any lingering imports. */
export const ensureSampleMedia = normalizeLoadedCatalog;

export async function saveCatalog(
  kind: CatalogKind,
  catalog: Catalog,
): Promise<void> {
  catalog.updatedAt = new Date().toISOString();
  const written = await writeBlobText(
    keyFor(kind),
    JSON.stringify(catalog, null, 2),
  );
  if (!written) {
    throw new Error(`Failed to persist ${keyFor(kind)}`);
  }
}

export async function publishDraft(): Promise<Catalog> {
  const draft = await loadCatalog("draft");
  const live = await loadCatalog("live");
  const nextVersion = (live.version || 1) + 1;
  const published: Catalog = {
    ...draft,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };
  const archive = await writeBlobText(
    `catalog-v${live.version || 1}.json`,
    JSON.stringify(live, null, 2),
  );
  if (!archive) {
    throw new Error("Failed to archive previous live catalog");
  }
  await saveCatalog("live", published);
  await saveCatalog("draft", published);
  return published;
}

export async function upsertArtwork(artwork: Artwork): Promise<Catalog> {
  const draft = await loadCatalog("draft");
  const idx = draft.artworks.findIndex((a) => a.id === artwork.id);
  if (idx >= 0) {
    draft.artworks[idx] = artwork;
  } else {
    artwork.sort =
      draft.artworks.length === 0
        ? 0
        : Math.max(...draft.artworks.map((a) => a.sort)) + 1;
    draft.artworks.push(artwork);
  }
  draft.artworks.sort((a, b) => a.sort - b.sort);
  await saveCatalog("draft", draft);
  return draft;
}

export async function deleteArtwork(id: string): Promise<Catalog> {
  const draft = await loadCatalog("draft");
  const removed = draft.artworks.find((a) => a.id === id);
  draft.artworks = draft.artworks.filter((a) => a.id !== id);
  draft.artworks.forEach((a, i) => {
    a.sort = i;
  });
  if (draft.layout) {
    draft.layout = {
      ...normalizeLayout(draft.layout),
      placements: normalizeLayout(draft.layout).placements.filter(
        (p) => p.artworkId !== id,
      ),
    };
  }
  await saveCatalog("draft", draft);
  if (removed) {
    await deleteArtworkMediaBestEffort(removed);
  }
  return draft;
}

/** Best-effort blob cleanup for artwork media URLs (ignores static /samples). */
async function deleteArtworkMediaBestEffort(art: Artwork): Promise<void> {
  const paths = artworkMediaPathnames(art);
  await Promise.all(
    paths.map(async (pathname) => {
      try {
        await deleteBlob(pathname);
      } catch {
        /* best-effort */
      }
    }),
  );
}

export async function reorderArtworks(ids: string[]): Promise<Catalog> {
  const draft = await loadCatalog("draft");
  const map = new Map(draft.artworks.map((a) => [a.id, a]));
  const reordered: Artwork[] = [];
  ids.forEach((id, i) => {
    const art = map.get(id);
    if (art) {
      art.sort = i;
      reordered.push(art);
      map.delete(id);
    }
  });
  for (const rest of map.values()) {
    rest.sort = reordered.length;
    reordered.push(rest);
  }
  draft.artworks = reordered;
  await saveCatalog("draft", draft);
  return draft;
}

export async function updateSettings(
  settings: CatalogSettings,
): Promise<Catalog> {
  const draft = await loadCatalog("draft");
  draft.settings = normalizeSettings(settings);
  await saveCatalog("draft", draft);
  return draft;
}

/** Debounced admin autosave target: replace draft layout only. */
export async function saveDraftLayout(layout: GalleryLayout): Promise<Catalog> {
  const draft = await loadCatalog("draft");
  draft.layout = syncPaintingYaws(normalizeLayout(layout));
  normalizeSculpturePlacements(draft);
  await saveCatalog("draft", draft);
  return draft;
}

export async function saveDraftCatalog(catalog: Catalog): Promise<Catalog> {
  const next: Catalog = {
    ...catalog,
    layout: normalizeLayout(catalog.layout ?? emptyLayout()),
  };
  normalizeSculpturePlacements(next);
  await saveCatalog("draft", next);
  return next;
}

export {
  liveCatalogView,
  publicArtworks,
} from "./live-catalog-view";

/** True when draft layout or published set differs from live (dirty for Publish). */
export function catalogsDifferForPublish(draft: Catalog, live: Catalog): boolean {
  const strip = (c: Catalog) =>
    JSON.stringify({
      layout: normalizeLayout(c.layout),
      artworks: c.artworks,
      settings: c.settings,
    });
  return strip(draft) !== strip(live);
}
