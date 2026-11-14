import {
  createDefaultCatalog,
  type Catalog,
  type Artwork,
  type CatalogSettings,
} from "./catalog-types";
import { readBlobText, writeBlobText } from "./blob-store";

const LIVE_KEY = "catalog-live.json";
const DRAFT_KEY = "catalog-draft.json";

export type CatalogKind = "live" | "draft";

function keyFor(kind: CatalogKind): string {
  return kind === "live" ? LIVE_KEY : DRAFT_KEY;
}

export async function loadCatalog(kind: CatalogKind): Promise<Catalog> {
  const raw = await readBlobText(keyFor(kind));
  if (!raw) {
    const empty = createDefaultCatalog();
    if (kind === "draft") {
      const live = await readBlobText(LIVE_KEY);
      if (live) {
        try {
          return JSON.parse(live) as Catalog;
        } catch {
          /* fall through */
        }
      }
    }
    await saveCatalog(kind, empty);
    return empty;
  }
  try {
    return JSON.parse(raw) as Catalog;
  } catch {
    return createDefaultCatalog();
  }
}

export async function saveCatalog(
  kind: CatalogKind,
  catalog: Catalog,
): Promise<void> {
  catalog.updatedAt = new Date().toISOString();
  await writeBlobText(keyFor(kind), JSON.stringify(catalog, null, 2));
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
  await writeBlobText(
    `catalog-v${live.version || 1}.json`,
    JSON.stringify(live, null, 2),
  );
  await saveCatalog("live", published);
  await saveCatalog("draft", published);
  return published;
}

export async function upsertArtwork(
  artwork: Artwork,
): Promise<Catalog> {
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
  draft.artworks = draft.artworks.filter((a) => a.id !== id);
  draft.artworks.forEach((a, i) => {
    a.sort = i;
  });
  await saveCatalog("draft", draft);
  return draft;
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
  draft.settings = settings;
  await saveCatalog("draft", draft);
  return draft;
}

export function publicArtworks(catalog: Catalog): Artwork[] {
  return catalog.artworks
    .filter((a) => a.published)
    .sort((a, b) => a.sort - b.sort);
}
