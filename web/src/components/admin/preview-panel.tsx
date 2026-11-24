"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Artwork,
  ArtworkType,
  BookletPage,
  Catalog,
  GalleryLayout,
  Locale,
} from "@/lib/catalog-types";
import {
  emptyBookletPage,
  emptyLocalized,
  LOCALES,
  emptyLayout,
  nextBookletPageKey,
  normalizeArtwork,
  normalizeArtworkBooklet,
} from "@/lib/catalog-types";
import { LangSwitcher } from "@/components/lang-switcher";
import { BookletOverlay } from "@/components/exhibition/booklet-overlay";
import { adminEditorStrings } from "@/lib/i18n";
import { useGalleryLocale } from "@/lib/use-gallery-locale";
import {
  ARTWORK_UPLOAD_ACCEPT,
  IMAGE_MAX_BYTES,
  validateArtworkUpload,
} from "@/lib/artwork-upload";
import {
  processArtworkImage,
  uploadArtworkBinary,
} from "@/lib/artwork-upload-client";
import { formatAdminApiError, readAdminJson } from "@/lib/admin-api";
import { GalleryRoomEditor, ensureLayout } from "./gallery-room-editor";
import { ArtworkThumb } from "./artwork-thumb";
import { LocalizedAutoFields } from "./localized-auto-fields";

const AUTOSAVE_MS = 400;

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function PreviewPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Artwork | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState("");
  const { locale, setLocale } = useGalleryLocale();
  const adminT = adminEditorStrings(locale);
  const layoutRef = useRef<GalleryLayout>(emptyLayout());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayout = useRef<GalleryLayout | null>(null);
  const saveGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const [catRes, tokRes, layoutMeta] = await Promise.all([
      fetch("/api/catalog?catalog=draft"),
      fetch("/api/admin/preview-token", { method: "POST" }),
      fetch("/api/admin/layout"),
    ]);
    if (!catRes.ok) {
      const body = await catRes.json().catch(() => null);
      throw new Error(
        formatAdminApiError(body, `Catalog load failed (${catRes.status})`),
      );
    }
    if (!tokRes.ok) {
      const body = await tokRes.json().catch(() => null);
      throw new Error(
        formatAdminApiError(body, `Preview token failed (${tokRes.status})`),
      );
    }
    const cat = (await catRes.json()) as Catalog;
    const tok = await tokRes.json();
    setCatalog({ ...cat, layout: ensureLayout(cat.layout) });
    layoutRef.current = ensureLayout(cat.layout);
    setToken(tok.token);
    if (layoutMeta.ok) {
      const meta = await layoutMeta.json();
      setDirty(Boolean(meta.dirty));
      setLiveUpdatedAt(meta.liveUpdatedAt || "");
    } else {
      setMessage(
        `Layout meta failed (${layoutMeta.status}) — dirty state may be stale`,
      );
    }
  }, []);

  useEffect(() => {
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [refresh]);

  const publishedArts = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.artworks]
      .filter((a) => a.published)
      .sort((a, b) => a.sort - b.sort);
  }, [catalog]);

  const allArts = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.artworks].sort((a, b) => a.sort - b.sort);
  }, [catalog]);

  // adminBuild=1 keeps Photon/queue presence off in admin 3D previews.
  const planPreviewSrc = token
    ? `/exhibition?catalog=draft&token=${encodeURIComponent(token)}&lang=${locale}&adminBuild=1&_=${encodeURIComponent(catalog?.updatedAt || "draft")}`
    : "";
  const liveExhibitionSrc = `/exhibition?lang=${locale}&adminBuild=1&_=${encodeURIComponent(liveUpdatedAt || "live")}`;

  const persistLayout = useCallback(async (layout: GalleryLayout) => {
    const gen = saveGeneration.current;
    setSaveStatus("saving");
    setSaveError("");
    try {
      const res = await fetch("/api/admin/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      });
      const data = await readAdminJson<{
        catalog: Catalog;
        layout: GalleryLayout;
        dirty?: boolean;
      }>(res, "Layout save failed");
      // Ignore stale responses if a newer local edit superseded this PUT.
      if (gen !== saveGeneration.current) return;
      setCatalog((prev) =>
        prev
          ? { ...data.catalog, layout: ensureLayout(data.catalog.layout) }
          : data.catalog,
      );
      layoutRef.current = ensureLayout(data.layout);
      setDirty(Boolean(data.dirty));
      setSaveStatus("saved");
    } catch (e) {
      if (gen !== saveGeneration.current) return;
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : "Autosave failed");
    }
  }, []);

  const scheduleLayoutSave = useCallback(
    (layout: GalleryLayout) => {
      pendingLayout.current = layout;
      layoutRef.current = layout;
      // Bump so an in-flight older PUT cannot overwrite newer local placements.
      saveGeneration.current += 1;
      setCatalog((prev) => (prev ? { ...prev, layout } : prev));
      setDirty(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const next = pendingLayout.current;
        pendingLayout.current = null;
        if (next) void persistLayout(next);
      }, AUTOSAVE_MS);
    },
    [persistLayout],
  );

  function retrySave() {
    void persistLayout(layoutRef.current);
  }

  async function publishLive() {
    setBusy(true);
    setMessage("");
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      if (pendingLayout.current) {
        await persistLayout(pendingLayout.current);
        pendingLayout.current = null;
      }
      const res = await fetch("/api/admin/publish", { method: "POST" });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Publish failed",
      );
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout),
      });
      setDirty(false);
      setLiveUpdatedAt(data.catalog.updatedAt || "");
      setMessage("Published to live site");
      await refresh().catch(() => undefined);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function reorder(ids: string[]) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Reorder failed",
      );
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout ?? catalog?.layout),
      });
      setDirty(true);
      setMessage("Order saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = allArts.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorder(ids);
  }

  async function saveArtwork(
    artwork: Artwork,
    opts?: { successMessage?: string },
  ): Promise<void> {
    setBusy(true);
    setMessage("");
    try {
      const payload = normalizeArtwork(artwork, {
        syncTitleTextFromBooklet: true,
      });
      const res = await fetch("/api/admin/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await readAdminJson<{ catalog: Catalog }>(res, "Save failed");
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout ?? catalog?.layout),
      });
      setDirty(true);
      setEditing(null);
      setMessage(opts?.successMessage ?? "Saved");
      await refresh().catch(() => undefined);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function removeArtwork(id: string) {
    if (!confirm("Delete this artwork?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch(`/api/admin/artworks/${id}`, { method: "DELETE" });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Delete failed",
      );
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout ?? catalog?.layout),
      });
      setDirty(true);
      setMessage("Deleted");
      await refresh().catch(() => undefined);
    } catch (e) {
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
          ? "Marked published in draft — Publish to live site to show on wall"
          : "Unpublished in draft — Publish to live site to remove from wall",
      },
    );
  }

  function startNew() {
    setEditing(
      normalizeArtwork({
        id: crypto.randomUUID(),
        type: "image",
        sort: catalog?.artworks.length ?? 0,
        published: true,
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

  if (error) {
    return <p className="text-[#e08a7a]">{error}</p>;
  }

  const layout = ensureLayout(catalog?.layout);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Preview · Layout
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <LangSwitcher value={locale} onChange={setLocale} />
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => startNew()}
          >
            {adminT.uploadArtwork}
          </button>
          <button
            type="button"
            className="btn btn-solid"
            disabled={busy}
            title="Publish live catalog from this draft"
            onClick={() => void publishLive()}
          >
            {adminT.publishToLive}
            {dirty ? " ·" : ""}
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-[var(--paper-dim)]">
        {adminT.draftAutosaveIntro}
        {liveUpdatedAt
          ? adminT.lastLivePublish.replace(
              "{date}",
              new Date(liveUpdatedAt).toLocaleString(),
            )
          : ""}
        {dirty ? adminT.unpublishedDraft : adminT.liveMatchesDraft}
        {adminT.publishLiveHint}
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

      <div className="mb-8">
        <GalleryRoomEditor
          layout={layout}
          onLayoutChange={scheduleLayoutSave}
          saveStatus={saveStatus}
          saveError={saveError}
          onRetrySave={retrySave}
          artworks={allArts}
          locale={locale}
        />
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {planPreviewSrc ? (
            <a
              href={planPreviewSrc}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--amber-bright)] underline-offset-2 hover:underline"
            >
              {adminT.openDraft3d}
            </a>
          ) : null}
          <a
            href={liveExhibitionSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--amber-bright)] underline-offset-2 hover:underline"
          >
            {adminT.openLive3d}
          </a>
        </p>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
          Artworks ({allArts.length})
        </h2>
        <p className="mb-4 text-sm text-[var(--paper-dim)]">
          {adminT.artworksPlaceHint}
        </p>
        <ul className="space-y-3">
          {allArts.map((art) => {
            const slotNum = art.published
              ? publishedArts.findIndex((p) => p.id === art.id) + 1
              : null;
            return (
              <li
                key={art.id}
                className={`flex flex-wrap items-center gap-3 border p-4 ${
                  highlightedId === art.id
                    ? "border-[var(--amber)] bg-[#221c16]"
                    : "border-[var(--line)] bg-[#1a1612]"
                }`}
                onClick={() => setHighlightedId(art.id)}
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-[var(--line)] font-[family-name:var(--font-ui)] text-sm">
                  {slotNum ?? "—"}
                </span>
                <ArtworkThumb art={art} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {art.title[locale] || art.title.en || "(untitled)"}{" "}
                    <span className="text-xs text-[var(--paper-dim)]">
                      · {art.type}
                    </span>
                  </p>
                  <p className="text-xs text-[var(--paper-dim)]">
                    {art.published ? "published" : "draft"} · sort {art.sort}
                    {art.modelUrl ? " · has GLB" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(art.id, -1);
                    }}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      move(art.id, 1);
                    }}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePublished(art);
                    }}
                  >
                    {art.published ? "Unpublish" : "Publish"}
                  </button>
                  <button
                    type="button"
                    className="btn !py-1 !px-2 !text-[0.65rem]"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(normalizeArtwork(art));
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger !py-1 !px-2 !text-[0.65rem]"
                    disabled={busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeArtwork(art.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        {allArts.length === 0 ? (
          <p className="mt-4 text-[var(--paper-dim)]">
            No artworks yet. Add an image, video, or sculpture.
          </p>
        ) : null}
      </div>

      {editing ? (
        <PreviewArtworkEditor
          artwork={editing}
          busy={busy}
          mediaHint={adminT.uploadMediaHint}
          onCancel={() => setEditing(null)}
          onSave={saveArtwork}
          onBusy={setBusy}
          onMessage={setMessage}
        />
      ) : null}
    </div>
  );
}

function PreviewArtworkEditor({
  artwork,
  busy,
  mediaHint,
  onCancel,
  onSave,
  onBusy,
  onMessage,
}: {
  artwork: Artwork;
  busy: boolean;
  mediaHint: string;
  onCancel: () => void;
  onSave: (a: Artwork) => Promise<void>;
  onBusy: (v: boolean) => void;
  onMessage: (m: string) => void;
}) {
  const [draft, setDraft] = useState<Artwork>(() => normalizeArtwork(artwork));
  const [previewLocale, setPreviewLocale] = useState<Locale>("en");
  const [previewPage, setPreviewPage] = useState(0);
  const bookletPages = normalizeArtworkBooklet(draft);

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
        setDraft((d) =>
          applyTypeDefaults("image", {
            ...d,
            urlWall: data.urlWall,
            urlFull: data.urlFull,
          }),
        );
        onMessage("Image processed");
        return;
      }
      if (validated.kind === "video") {
        onMessage("Uploading video…");
        const blob = await uploadArtworkBinary(file, validated);
        setDraft((d) =>
          applyTypeDefaults("video", {
            ...d,
            urlVideo: blob.url,
            urlPoster: blob.urlPoster || d.urlPoster,
          }),
        );
        onMessage("Video uploaded");
        return;
      }
      onMessage("Uploading 3D model…");
      const blob = await uploadArtworkBinary(file, validated);
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4">
      <div className="my-8 w-full max-w-5xl border border-[var(--line)] bg-[#161310] p-6">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Edit {draft.type}
        </h2>
        <LocalizedAutoFields
          label="Title"
          values={draft.title}
          onChange={(title) => setDraft((d) => ({ ...d, title }))}
          onApplyTranslations={(merge) =>
            setDraft((d) => ({ ...d, title: merge(d.title) }))
          }
        />
        <div className="mb-4 flex items-center gap-2">
          <input
            id="preview-published"
            type="checkbox"
            checked={draft.published}
            onChange={(e) =>
              setDraft((d) => ({ ...d, published: e.target.checked }))
            }
            className="!w-auto"
          />
          <label
            htmlFor="preview-published"
            className="!mb-0 !normal-case !tracking-normal"
          >
            Published in catalog
          </label>
        </div>
        <div className="mb-4">
          <label>{mediaHint}</label>
          <input
            type="file"
            accept={ARTWORK_UPLOAD_ACCEPT}
            onChange={(e) => onMediaFile(e.target.files?.[0] || null)}
          />
          {draft.type === "model" && draft.modelUrl ? (
            <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
              model: {draft.modelUrl}
            </p>
          ) : null}
          {draft.type === "video" && draft.urlVideo ? (
            <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
              video: {draft.urlVideo}
            </p>
          ) : null}
          {draft.type === "image" && draft.urlWall ? (
            <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
              wall: {draft.urlWall}
            </p>
          ) : null}
        </div>
        {draft.type === "video" ? (
          <div className="mb-4">
            <label>Poster</label>
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
            onClick={() => onSave({ ...draft, booklet: bookletPages })}
          >
            Save
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}