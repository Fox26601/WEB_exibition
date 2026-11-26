import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { createDefaultCatalog, normalizeLayout } from "./catalog-types.ts";

const DATA_DIR = path.join(process.cwd(), ".data");
const DRAFT = path.join(DATA_DIR, "catalog-draft.json");
const LIVE = path.join(DATA_DIR, "catalog-live.json");

function etag(content) {
  return `"sha256-${createHash("sha256").update(content).digest("hex")}"`;
}

describe("catalog delete vs concurrent draft writes", () => {
  before(async () => {
    await mkdir(DATA_DIR, { recursive: true });
    const catalog = createDefaultCatalog();
    const raw = JSON.stringify(catalog, null, 2);
    await writeFile(DRAFT, raw, "utf8");
    await writeFile(LIVE, raw, "utf8");
  });

  after(async () => {
    // Leave .data for local dev; only remove keys we touched if empty needed.
    // Tests re-write draft/live — do not wipe unrelated uploads.
  });

  it("deleteArtwork removes sample sculpture and survives settings race", async () => {
    const { deleteArtwork, updateSettings, loadCatalog, saveCatalog } =
      await import("./catalog.ts");

    const base = createDefaultCatalog();
    base.settings.email = "before@example.com";
    await saveCatalog("draft", base);

    const target = "sample-sculpture-obelisk";
    assert.ok(base.artworks.some((a) => a.id === target));

    // Simulate lost-update race without CAS: layout/settings used to load,
    // then overwrite a delete. With mutateDraftCatalog + ifMatch, both commit.
    const [deleted, settings] = await Promise.all([
      deleteArtwork(target),
      updateSettings({
        ...base.settings,
        email: "after-race@example.com",
      }),
    ]);

    assert.equal(
      deleted.artworks.some((a) => a.id === target),
      false,
      "delete response must omit artwork",
    );
    assert.equal(settings.settings.email, "after-race@example.com");

    const draft = await loadCatalog("draft");
    assert.equal(
      draft.artworks.some((a) => a.id === target),
      false,
      "draft must not resurrect deleted sculpture",
    );
    assert.equal(draft.settings.email, "after-race@example.com");
    assert.equal(
      draft.layout.placements.some((p) => p.artworkId === target),
      false,
    );
  });

  it("stale full-file overwrite without CAS would resurrect — CAS etag blocks it", async () => {
    const { BlobWriteConflictError } = await import("./blob-store.ts");
    const { writeBlobText, readBlobTextDetailed } = await import(
      "./blob-store.ts"
    );

    const stale = createDefaultCatalog();
    const fresh = createDefaultCatalog();
    fresh.artworks = fresh.artworks.filter(
      (a) => a.id !== "sample-sculpture-plinth",
    );
    const freshRaw = JSON.stringify(fresh, null, 2);
    await writeFile(DRAFT, freshRaw, "utf8");

    const staleRaw = JSON.stringify(stale, null, 2);
    const wrongEtag = etag("not-the-current-bytes");

    await assert.rejects(
      () =>
        writeBlobText("catalog-draft.json", staleRaw, {
          contentType: "application/json",
          ifMatch: wrongEtag,
        }),
      (err) => err instanceof BlobWriteConflictError,
    );

    const still = await readBlobTextDetailed("catalog-draft.json");
    assert.ok(still.text);
    const parsed = JSON.parse(still.text);
    assert.equal(
      parsed.artworks.some((a) => a.id === "sample-sculpture-plinth"),
      false,
    );
  });

  it("draft bootstrap from live persists draft instead of ephemeral live view", async () => {
    const { loadCatalog } = await import("./catalog.ts");
    const live = createDefaultCatalog();
    live.settings.email = "live-only@example.com";
    await writeFile(LIVE, JSON.stringify(live, null, 2), "utf8");
    await rm(DRAFT, { force: true });

    const draft = await loadCatalog("draft");
    assert.equal(draft.settings.email, "live-only@example.com");

    const onDisk = JSON.parse(await readFile(DRAFT, "utf8"));
    assert.equal(onDisk.settings.email, "live-only@example.com");

    // Mutate live — draft must stay independent (not re-read live on next load).
    live.settings.email = "live-changed@example.com";
    await writeFile(LIVE, JSON.stringify(live, null, 2), "utf8");
    const draftAgain = await loadCatalog("draft");
    assert.equal(draftAgain.settings.email, "live-only@example.com");
  });

  it("deleteArtwork strips placements for the id", async () => {
    const { deleteArtwork, saveCatalog, loadCatalog } = await import(
      "./catalog.ts"
    );
    const catalog = createDefaultCatalog();
    const id = "sample-sculpture-box";
    catalog.layout = {
      ...normalizeLayout(catalog.layout),
      rooms: [
        {
          id: "room-1",
          shape: "square",
          transform: { x: 0, z: 0, rotation: 0, scaleX: 1, scaleZ: 1 },
        },
      ],
      placements: [
        {
          artworkId: id,
          kind: "sculpture",
          roomId: "room-1",
          floorX: 1,
          floorZ: 2,
          yaw: 0,
          frameId: "none",
        },
      ],
    };
    await saveCatalog("draft", catalog);
    await deleteArtwork(id);
    const draft = await loadCatalog("draft");
    assert.equal(draft.artworks.some((a) => a.id === id), false);
    assert.equal(
      draft.layout.placements.some((p) => p.artworkId === id),
      false,
    );
  });

  it("deleteArtwork also strips the id from live catalog", async () => {
    const { deleteArtwork, saveCatalog, loadCatalog } = await import(
      "./catalog.ts"
    );
    const catalog = createDefaultCatalog();
    const id = "sample-sculpture-obelisk";
    await saveCatalog("live", catalog);
    await saveCatalog("draft", structuredClone(catalog));
    await deleteArtwork(id);
    const live = await loadCatalog("live");
    const draft = await loadCatalog("draft");
    assert.equal(draft.artworks.some((a) => a.id === id), false);
    assert.equal(live.artworks.some((a) => a.id === id), false);
  });
});
