"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Artwork,
  ArtworkType,
  BookletPage,
  Catalog,
  Locale,
} from "@/lib/catalog-types";
import {
  emptyBookletPage,
  nextBookletPageKey,
  emptyLocalized,
  LOCALES,
  normalizeArtwork,
  normalizeArtworkBooklet,
  normalizeLayout,
} from "@/lib/catalog-types";
import { BookletOverlay } from "@/components/exhibition/booklet-overlay";
import { ModalShell } from "@/components/modal-shell";
import {
  ARTWORK_UPLOAD_ACCEPT,
  IMAGE_MAX_BYTES,
  validateArtworkUpload,
} from "@/lib/artwork-upload";
import {
  deleteOrphanUploadUrls,
  processArtworkImage,
  trackSessionUploadUrls,
  uploadArtworkBinary,
} from "@/lib/artwork-upload-client";
import { adminFetch, readAdminJson } from "@/lib/admin-api";
import { fillArtworkLocales } from "@/lib/admin-translate-client";
import {
  confirmPublishWithPlacedDrafts,
  countPlacedUnpublished,
  ensureAdminDraftFlushListener,
  flushAllAdminDraftWriters,
} from "@/lib/admin-draft-writers";
import { ArtworkThumb } from "./artwork-thumb";
import { LocalizedAutoFields } from "./localized-auto-fields";

export function ArtworksManager() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Artwork | null>(null);

  const refresh = useCallback(async () => {
    const res = await adminFetch("/api/admin/artworks");
    const data = await readAdminJson<Catalog>(res, "Failed to load artworks");
    setCatalog(data);
  }, []);

  useEffect(() => {
    ensureAdminDraftFlushListener();
    refresh().catch((e) => setMessage(e instanceof Error ? e.message : String(e)));
  }, [refresh]);

  async function publishCatalog() {
    const layout = normalizeLayout(catalog?.layout);
    const placedDrafts = countPlacedUnpublished(
      catalog?.artworks ?? [],
      layout.placements,
    );
    if (
      !confirmPublishWithPlacedDrafts(
        placedDrafts,
        "Publish draft catalog to live?",
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await flushAllAdminDraftWriters();
      const res = await adminFetch("/api/admin/publish", { method: "POST" });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Publish failed",
      );
      setCatalog(data.catalog);
      setMessage(`Published v${data.catalog.version}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function saveArtwork(
    artwork: Artwork,
    opts?: { successMessage?: string },
  ): Promise<void> {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { artwork: filled, error: translateError } =
        await fillArtworkLocales(artwork);
      const payload = normalizeArtwork(filled, {
        syncTitleTextFromBooklet: true,
      });
      const res = await adminFetch("/api/admin/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readAdminJson<{ catalog: Catalog }>(res, "Save failed");
      // Trust POST body — do not refetch (Safari HTTP cache can resurrect stale rows).
      setCatalog(data.catalog);
      setEditing(null);
      setMessage(
        translateError
          ? `${opts?.successMessage ?? "Saved"} — ${translateError}`
          : (opts?.successMessage ?? "Saved"),
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function removeArtwork(id: string) {
    if (busy) return;
    if (
      !confirm(
        "Delete this artwork from draft and live gallery now? (Hide from live only flips the draft flag — Publish catalog is still required to update the wall.)",
      )
    )
      return;
    const previous = catalog;
    setBusy(true);
    setMessage("");
    // Optimistic remove so the row cannot stick around while a refetch races.
    setCatalog((prev) =>
      prev
        ? {
            ...prev,
            artworks: prev.artworks.filter((a) => a.id !== id),
          }
        : prev,
    );
    if (editing?.id === id) setEditing(null);
    try {
      const res = await adminFetch(`/api/admin/artworks/${id}`, {
        method: "DELETE",
      });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Delete failed",
      );
      // Trust DELETE body as source of truth for the list.
      setCatalog(data.catalog);
      setMessage("Deleted from draft and live");
    } catch (e) {
      setCatalog(previous);
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(art: Artwork) {
    const nextPublished = !art.published;
    await saveArtwork(
      { ...art, published: nextPublished },
      {
        successMessage: nextPublished
          ? "Show on live (draft flag) — Publish catalog to update the live wall"
          : "Hide from live (draft flag) — Publish catalog to remove from the live wall",
      },
    );
  }

  async function move(id: string, dir: -1 | 1) {
    if (!catalog) return;
    const ids = catalog.artworks.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setBusy(true);
    try {
      const res = await adminFetch("/api/admin/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Reorder failed",
      );
      setCatalog(data.catalog);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function startNew() {
    setEditing(
      normalizeArtwork({
        id: crypto.randomUUID(),
        type: "image",
        sort: catalog?.artworks.length ?? 0,
        published: false,
        title: emptyLocalized(),
        text: emptyLocalized(),
        booklet: [emptyBookletPage(nextBookletPageKey([]))],
        urlWall: "",
        urlFull: "",
        urlVideo: "",
        urlPoster: "",
        modelUrl: "",
        frameId: "wood",
      }),
    );
  }

  if (!catalog) {
    return (
      <p className="text-[var(--paper-dim)]">
        {message ? (
          <span className="text-[#e08a7a]">{message}</span>
        ) : (
          "Loading…"
        )}
      </p>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Artworks
        </h1>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => startNew()}
          >
            + Upload artwork
          </button>
          <button
            type="button"
            className="btn btn-solid"
            disabled={busy}
            onClick={publishCatalog}
            title="Live gallery updates only after Publish"
          >
            Publish catalog
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-[var(--paper-dim)]">
        New uploads default to draft. Publish an artwork (or check Published in
        catalog when editing), then use Publish catalog to show it on the live
        gallery wall.
      </p>

      {message ? (
        <p
          className={`mb-4 border px-3 py-2 text-sm ${
            /failed|error|403|4\d\d|5\d\d/i.test(message)
              ? "border-[#e08a7a]/50 bg-[#2a1612] text-[#e08a7a]"
              : "border-[var(--line)] text-[var(--amber-bright)]"
          }`}
          role="status"
        >
          {message}
        </p>
      ) : null}

      <ul className="space-y-3">
        {catalog.artworks.map((art) => (
          <li
            key={art.id}
            className="flex flex-wrap items-center gap-3 border border-[var(--line)] bg-[#1a1612] p-4"
          >
            <ArtworkThumb art={art} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                {art.title.en || "(untitled)"}{" "}
                <span className="text-xs text-[var(--paper-dim)]">
                  · {art.type}
                </span>
              </p>
              <p className="text-xs text-[var(--paper-dim)]">
                {art.published ? "published" : "draft"} · sort {art.sort}
                {art.modelUrl ? " · has model" : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                disabled={busy}
                onClick={() => move(art.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                disabled={busy}
                onClick={() => move(art.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                disabled={busy}
                onClick={() => togglePublished(art)}
              >
                {art.published ? "Hide from live" : "Show on live"}
              </button>
              <button
                type="button"
                className="btn !py-1 !px-2 !text-[0.65rem]"
                disabled={busy}
                onClick={() => setEditing(normalizeArtwork(art))}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger !py-1 !px-2 !text-[0.65rem]"
                disabled={busy}
                onClick={() => removeArtwork(art.id)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {catalog.artworks.length === 0 ? (
        <p className="mt-6 text-[var(--paper-dim)]">
          No artworks yet. Upload an image, video, or 3D sculpture (GLB/GLTF).
        </p>
      ) : null}

      {editing ? (
        <ArtworkEditor
          artwork={editing}
          isNew={!catalog.artworks.some((a) => a.id === editing.id)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={saveArtwork}
          onBusy={setBusy}
          onMessage={setMessage}
        />
      ) : null}
    </div>
  );
}

function ArtworkEditor({
  artwork,
  isNew,
  busy,
  onCancel,
  onSave,
  onBusy,
  onMessage,
}: {
  artwork: Artwork;
  isNew: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (a: Artwork) => Promise<void>;
  onBusy: (v: boolean) => void;
  onMessage: (m: string) => void;
}) {
  const [draft, setDraft] = useState<Artwork>(() => normalizeArtwork(artwork));
  const [previewLocale, setPreviewLocale] = useState<Locale>("en");
  const [previewPage, setPreviewPage] = useState(0);
  const sessionUploads = useRef<Set<string>>(new Set());
  const bookletPages = normalizeArtworkBooklet(draft);

  function handleCancel() {
    const urls = [...sessionUploads.current];
    sessionUploads.current.clear();
    onCancel();
    if (urls.length) void deleteOrphanUploadUrls(urls);
  }

  function setBooklet(pages: BookletPage[]) {
    setDraft((d) => ({ ...d, booklet: pages }));
    setPreviewPage((p) => Math.min(p, Math.max(0, pages.length - 1)));
  }

  function updateBookletPage(index: number, page: BookletPage) {
    const next = bookletPages.slice();
    next[index] = page;
    setBooklet(next);
  }

  function addBookletPage() {
    setBooklet([
      ...bookletPages,
      emptyBookletPage(nextBookletPageKey(bookletPages)),
    ]);
  }

  function removeBookletPage(index: number) {
    const next = bookletPages.filter((_, i) => i !== index);
    setBooklet(
      next.length ? next : [emptyBookletPage(nextBookletPageKey([]))],
    );
  }

  function applyTypeDefaults(kind: ArtworkType, prev: Artwork): Artwork {
    return {
      ...prev,
      type: kind,
      frameId: kind === "model" ? "none" : prev.frameId || "wood",
    };
  }

  async function onMediaFile(file: File | null) {
    if (!file) return;
    const validated = validateArtworkUpload(file);
    if (!validated.ok) {
      onMessage(validated.error);
      return;
    }

    onBusy(true);
    try {
      if (validated.kind === "image") {
        onMessage("Processing image…");
        const data = await processArtworkImage(file);
        trackSessionUploadUrls(
          sessionUploads.current,
          data.urlWall,
          data.urlFull,
        );
        setDraft((d) =>
          applyTypeDefaults("image", {
            ...d,
            urlWall: data.urlWall,
            urlFull: data.urlFull,
            mediaWidth: data.mediaWidth ?? d.mediaWidth,
            mediaHeight: data.mediaHeight ?? d.mediaHeight,
          }),
        );
        onMessage("Image processed");
        return;
      }

      if (validated.kind === "video") {
        onMessage("Uploading video…");
        const blob = await uploadArtworkBinary(file, validated);
        trackSessionUploadUrls(
          sessionUploads.current,
          blob.url,
          blob.urlPoster,
        );
        setDraft((d) =>
          applyTypeDefaults("video", {
            ...d,
            urlVideo: blob.url,
            urlPoster: blob.urlPoster || d.urlPoster,
            mediaWidth: blob.mediaWidth ?? d.mediaWidth,
            mediaHeight: blob.mediaHeight ?? d.mediaHeight,
          }),
        );
        onMessage("Video uploaded");
        return;
      }

      onMessage("Uploading 3D model…");
      const blob = await uploadArtworkBinary(file, validated);
      trackSessionUploadUrls(
        sessionUploads.current,
        blob.url,
        blob.urlPoster,
      );
      setDraft((d) =>
        applyTypeDefaults("model", {
          ...d,
          modelUrl: blob.url,
          urlPoster: blob.urlPoster || d.urlPoster,
        }),
      );
      onMessage("3D model uploaded");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error");
    } finally {
      onBusy(false);
    }
  }

  async function onPosterFile(file: File | null) {
    if (!file) return;
    if (file.size > IMAGE_MAX_BYTES) {
      onMessage("Poster exceeds 8MB");
      return;
    }
    onBusy(true);
    try {
      const data = await processArtworkImage(file);
      trackSessionUploadUrls(
        sessionUploads.current,
        data.urlWall,
        data.urlFull,
      );
      setDraft((d) => ({
        ...d,
        urlPoster: data.urlWall,
        urlWall: d.urlWall || data.urlWall,
        urlFull: d.urlFull || data.urlFull,
      }));
      onMessage("Poster set");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error");
    } finally {
      onBusy(false);
    }
  }

  const mediaSummary =
    draft.type === "model"
      ? draft.modelUrl
      : draft.type === "video"
        ? draft.urlVideo
        : draft.urlWall;

  return (
    <ModalShell
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"
      onClose={handleCancel}
      aria-label={isNew ? `Upload ${draft.type}` : `Edit ${draft.type}`}
    >
      <div className="my-8 w-full max-w-5xl border border-[var(--line)] bg-[#161310] p-6">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          {isNew ? "Upload" : "Edit"} {draft.type}
        </h2>

        <LocalizedAutoFields
          label="Title"
          values={draft.title}
          onChange={(title) => setDraft((d) => ({ ...d, title }))}
          onApplyTranslations={(merge) =>
            setDraft((d) => ({ ...d, title: merge(d.title) }))
          }
        />

        {!isNew ? (
          <div className="mb-4 flex items-center gap-2">
            <input
              id="published"
              type="checkbox"
              checked={draft.published}
              onChange={(e) =>
                setDraft((d) => ({ ...d, published: e.target.checked }))
              }
              className="!w-auto"
            />
            <label
              htmlFor="published"
              className="!mb-0 !normal-case !tracking-normal"
            >
              Show on live (draft flag — Publish catalog to update wall)
            </label>
          </div>
        ) : null}

        <div className="mb-4">
          <label>
            Media file — image, video (MP4/MOV/M4V/WebM), or 3D model
            (GLB/GLTF). Type is detected automatically. Wall playback uses the
            browser decoder (iPhone MOV/HEVC on Safari; prefer H.264 MP4 for
            widest support).
          </label>
          <input
            type="file"
            accept={ARTWORK_UPLOAD_ACCEPT}
            onChange={(e) => onMediaFile(e.target.files?.[0] || null)}
          />
          {mediaSummary ? (
            <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
              {draft.type}: {mediaSummary}
            </p>
          ) : null}
        </div>

        {draft.type === "video" || draft.type === "model" ? (
          <div className="mb-4">
            <label>Poster image (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPosterFile(e.target.files?.[0] || null)}
            />
          </div>
        ) : null}

        <section className="mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
              Artwork booklet
            </h3>
            <button
              type="button"
              className="btn !py-1.5 !text-xs"
              onClick={addBookletPage}
            >
              Add page
            </button>
          </div>
          <p className="mb-4 text-xs text-[var(--paper-dim)]">
            Page 1 title/body syncs to wall title and short text on save.
          </p>

          <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
            <div className="order-1 sticky top-0 z-10 bg-[#161310] pb-3 lg:order-2 lg:top-4 lg:self-start">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-[0.12em] text-[var(--paper-dim)]">
                  Live preview
                </span>
                <select
                  className="!w-auto !py-1 !text-xs"
                  value={previewLocale}
                  onChange={(e) => setPreviewLocale(e.target.value as Locale)}
                >
                  {LOCALES.map((locale) => (
                    <option key={locale} value={locale}>
                      {locale}
                    </option>
                  ))}
                </select>
              </div>
              <BookletOverlay
                pages={bookletPages}
                pageIndex={previewPage}
                locale={previewLocale}
                closeLabel="Close"
                onClose={() => undefined}
                onPage={setPreviewPage}
                embedded
                titleLabel="Booklet"
              />
            </div>

            <div className="order-2 space-y-6 lg:order-1">
              {bookletPages.map((page, index) => (
                <div
                  key={`booklet-${index}-${page.key}`}
                  className="border border-[var(--line)] p-4"
                >
                  <div className="mb-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-[10rem] flex-1">
                      <label>Page key (auto id)</label>
                      <input
                        value={page.key}
                        readOnly
                        aria-readonly="true"
                        title="Assigned automatically on create"
                      />
                    </div>
                    {bookletPages.length > 1 ? (
                      <button
                        type="button"
                        className="btn !py-1.5 !text-xs"
                        onClick={() => removeBookletPage(index)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                  <div className="mb-3">
                    <LocalizedAutoFields
                      label="Title"
                      values={page.title}
                      onChange={(title) =>
                        updateBookletPage(index, { ...page, title })
                      }
                      onApplyTranslations={(merge) =>
                        setDraft((d) => {
                          const pages = normalizeArtworkBooklet(d).slice();
                          const current = pages[index];
                          if (!current) return d;
                          pages[index] = {
                            ...current,
                            title: merge(current.title),
                          };
                          return { ...d, booklet: pages };
                        })
                      }
                    />
                  </div>
                  <LocalizedAutoFields
                    label="Body"
                    multiline
                    values={page.body}
                    onChange={(body) =>
                      updateBookletPage(index, { ...page, body })
                    }
                    onApplyTranslations={(merge) =>
                      setDraft((d) => {
                        const pages = normalizeArtworkBooklet(d).slice();
                        const current = pages[index];
                        if (!current) return d;
                        pages[index] = {
                          ...current,
                          body: merge(current.body),
                        };
                        return { ...d, booklet: pages };
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="btn btn-solid"
            disabled={busy}
            onClick={() =>
              void onSave({
                ...draft,
                booklet: bookletPages,
                published: isNew ? false : draft.published,
              })
            }
          >
            Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
