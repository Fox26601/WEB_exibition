import {
  createDefaultCatalog,
  emptyLayout,
  isNumericBookletPageKey,
  normalizeArtwork,
  normalizeLayout,
  normalizeSettings,
  type Catalog,
  type Artwork,
  type CatalogSettings,
  type GalleryLayout,
} from "./catalog-types";
import {
  deleteBlob,
  isBlobWriteConflict,
  readBlobTextDetailed,
  writeBlobText,
} from "./blob-store";
import { artworkMediaPathnames } from "./blob-pathname";
import { syncPaintingYaws } from "./placement-eval";
import { normalizeSculpturePlacements } from "./gallery-three/sculpture-seed";

const LIVE_KEY = "catalog-live.json";
const DRAFT_KEY = "catalog-draft.json";
const MUTATE_RETRIES = 6;

export type CatalogKind = "live" | "draft";

function keyFor(kind: CatalogKind): string {
  return kind === "live" ? LIVE_KEY : DRAFT_KEY;
}

type CatalogRecord = {
  catalog: Catalog;
  etag: string | null;
};

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

/**
 * Load catalog JSON. Draft missing → copy live once and persist as draft
 * (never return live without writing draft — that resurrected deletes after
 * transient blob misses). Hard read failures throw instead of seeding defaults.
 */
export async function loadCatalog(kind: CatalogKind): Promise<Catalog> {
  const record = await loadCatalogRecord(kind);
  return record.catalog;
}

async function loadCatalogRecord(kind: CatalogKind): Promise<CatalogRecord> {
  const key = keyFor(kind);
  const detailed = await readBlobTextDetailed(key);

  if (detailed.text) {
    try {
      const parsed = JSON.parse(detailed.text) as Catalog;
      const needsMigration = catalogNeedsNumericBookletMigration(parsed);
      const catalog = normalizeLoadedCatalog(parsed);
      if (needsMigration) {
        try {
          const written = await writeBlobText(
            key,
            JSON.stringify(catalog, null, 2),
            {
              contentType: "application/json",
              allowOverwrite: true,
              ifMatch: detailed.etag,
            },
          );
          return { catalog, etag: written?.etag ?? detailed.etag };
        } catch {
          /* concurrent writer — return normalized in-memory view */
          return { catalog, etag: detailed.etag };
        }
      }
      return { catalog, etag: detailed.etag };
    } catch {
      /* corrupt payload — fall through to bootstrap */
    }
  }

  if (kind === "draft") {
    const live = await readBlobTextDetailed(LIVE_KEY);
    if (live.text) {
      try {
        const fromLive = normalizeLoadedCatalog(JSON.parse(live.text) as Catalog);
        // Persist so later GETs / deletes do not keep bouncing to live.
        try {
          const written = await writeBlobText(
            DRAFT_KEY,
            JSON.stringify(fromLive, null, 2),
            { contentType: "application/json", allowOverwrite: false },
          );
          if (written) {
            return { catalog: fromLive, etag: written.etag };
          }
        } catch (err) {
          if (isBlobWriteConflict(err)) {
            // Another request created draft first — reload it.
            const again = await readBlobTextDetailed(DRAFT_KEY);
            if (again.text) {
              return {
                catalog: normalizeLoadedCatalog(
                  JSON.parse(again.text) as Catalog,
                ),
                etag: again.etag,
              };
            }
          } else {
            throw err;
          }
        }
        return { catalog: fromLive, etag: null };
      } catch (err) {
        if (err instanceof SyntaxError) {
          /* fall through to empty seed */
        } else {
          throw err;
        }
      }
    }
  }

  const empty = createDefaultCatalog();
  try {
    const written = await writeBlobText(
      key,
      JSON.stringify(empty, null, 2),
      { contentType: "application/json", allowOverwrite: false },
    );
    return { catalog: empty, etag: written?.etag ?? null };
  } catch (err) {
    if (isBlobWriteConflict(err)) {
      const again = await readBlobTextDetailed(key);
      if (again.text) {
        return {
          catalog: normalizeLoadedCatalog(JSON.parse(again.text) as Catalog),
          etag: again.etag,
        };
      }
    }
    /* first-boot seed may fail on read-only FS */
    return { catalog: empty, etag: null };
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
  catalog.artworks = catalog.artworks.map((art) => {
    const sample = byId.get(art.id);
    const next = { ...art };
    if (sample) {
      if (!next.urlWall && sample.urlWall) next.urlWall = sample.urlWall;
      if (!next.urlFull && sample.urlFull) next.urlFull = sample.urlFull;
      if (!next.urlPoster && sample.urlPoster) next.urlPoster = sample.urlPoster;
      if (!next.modelUrl && sample.modelUrl) next.modelUrl = sample.modelUrl;
      if (!next.frameId && sample.frameId) next.frameId = sample.frameId;
    }
    return normalizeArtwork(next);
  });
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
    { contentType: "application/json", allowOverwrite: true },
  );
  if (!written) {
    throw new Error(`Failed to persist ${keyFor(kind)}`);
  }
}

/**
 * Apply a draft mutation with compare-and-swap retries so layout/settings
 * autosaves cannot clobber a concurrent artwork delete (or vice versa).
 */
export async function mutateDraftCatalog(
  mutate: (draft: Catalog) => void,
  retries = MUTATE_RETRIES,
): Promise<Catalog> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    const { catalog, etag } = await loadCatalogRecord("draft");
    const next = structuredClone(catalog) as Catalog;
    mutate(next);
    next.updatedAt = new Date().toISOString();
    try {
      const written = await writeBlobText(
        DRAFT_KEY,
        JSON.stringify(next, null, 2),
        {
          contentType: "application/json",
          allowOverwrite: true,
          ifMatch: etag,
        },
      );
      if (!written) {
        throw new Error(`Failed to persist ${DRAFT_KEY}`);
      }
      return next;
    } catch (err) {
      lastErr = err;
      if (isBlobWriteConflict(err) && attempt < retries - 1) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Draft catalog write conflict");
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
    { contentType: "application/json", allowOverwrite: true },
  );
  if (!archive) {
    throw new Error("Failed to archive previous live catalog");
  }
  await saveCatalog("live", published);
  await saveCatalog("draft", published);
  return published;
}

export async function upsertArtwork(artwork: Artwork): Promise<Catalog> {
  return mutateDraftCatalog((draft) => {
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
  });
}

export async function deleteArtwork(id: string): Promise<Catalog> {
  let removed: Artwork | undefined;
  const catalog = await mutateDraftCatalog((draft) => {
    removed = draft.artworks.find((a) => a.id === id);
    draft.artworks = draft.artworks.filter((a) => a.id !== id);
    draft.artworks.forEach((a, i) => {
      a.sort = i;
    });
    if (draft.layout) {
      const layout = normalizeLayout(draft.layout);
      draft.layout = {
        ...layout,
        placements: layout.placements.filter((p) => p.artworkId !== id),
      };
    }
  });

  // Verify delete stuck (guards against a lost race leaving the id present).
  const verify = await loadCatalog("draft");
  if (verify.artworks.some((a) => a.id === id)) {
    const again = await mutateDraftCatalog((draft) => {
      draft.artworks = draft.artworks.filter((a) => a.id !== id);
      draft.artworks.forEach((a, i) => {
        a.sort = i;
      });
      if (draft.layout) {
        const layout = normalizeLayout(draft.layout);
        draft.layout = {
          ...layout,
          placements: layout.placements.filter((p) => p.artworkId !== id),
        };
      }
    });
    if (removed) {
      await deleteArtworkMediaBestEffort(removed);
    }
    return again;
  }

  if (removed) {
    await deleteArtworkMediaBestEffort(removed);
  }
  return catalog;
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
  return mutateDraftCatalog((draft) => {
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
  });
}

export async function updateSettings(
  settings: CatalogSettings,
): Promise<Catalog> {
  return mutateDraftCatalog((draft) => {
    draft.settings = normalizeSettings(settings);
  });
}

/** Debounced admin autosave target: replace draft layout only. */
export async function saveDraftLayout(layout: GalleryLayout): Promise<Catalog> {
  return mutateDraftCatalog((draft) => {
    draft.layout = syncPaintingYaws(normalizeLayout(layout));
    normalizeSculpturePlacements(draft);
  });
}

export async function saveDraftCatalog(catalog: Catalog): Promise<Catalog> {
  return mutateDraftCatalog((draft) => {
    draft.artworks = catalog.artworks;
    draft.settings = normalizeSettings(catalog.settings);
    draft.layout = normalizeLayout(catalog.layout ?? emptyLayout());
    draft.version = catalog.version;
    normalizeSculpturePlacements(draft);
  });
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
