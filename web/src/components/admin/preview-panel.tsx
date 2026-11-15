"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Artwork,
  Catalog,
  GalleryLayout,
  LocalizedString,
} from "@/lib/catalog-types";
import { emptyLocalized, LOCALES, emptyLayout } from "@/lib/catalog-types";
import { LangSwitcher } from "@/components/lang-switcher";
import { pickLocalized } from "@/lib/i18n";
import { useGalleryLocale } from "@/lib/use-gallery-locale";
import { GalleryRoomEditor, ensureLayout } from "./gallery-room-editor";
import { AdminBuildBridge } from "./admin-build-bridge";

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 80 * 1024 * 1024;
const MODEL_MAX = 40 * 1024 * 1024;
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
  const [iframeKey, setIframeKey] = useState(0);
  const [wizardStep, setWizardStep] = useState<"plan" | "place3d">("plan");
  const layoutRef = useRef<GalleryLayout>(emptyLayout());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLayout = useRef<GalleryLayout | null>(null);

  const refresh = useCallback(async () => {
    const [catRes, tokRes, layoutMeta] = await Promise.all([
      fetch("/api/catalog?catalog=draft"),
      fetch("/api/admin/preview-token", { method: "POST" }),
      fetch("/api/admin/layout"),
    ]);
    if (!catRes.ok || !tokRes.ok) throw new Error("Failed to load preview");
    const cat = (await catRes.json()) as Catalog;
    const tok = await tokRes.json();
    setCatalog({ ...cat, layout: ensureLayout(cat.layout) });
    layoutRef.current = ensureLayout(cat.layout);
    setToken(tok.token);
    if (layoutMeta.ok) {
      const meta = await layoutMeta.json();
      setDirty(Boolean(meta.dirty));
      setLiveUpdatedAt(meta.liveUpdatedAt || "");
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

  const planPreviewSrc = token
    ? `/exhibition?catalog=draft&token=${encodeURIComponent(token)}&lang=${locale}`
    : "";

  function goBackToPlan() {
    const warn =
      "Вернуться к плану комнат? Расстановка в черновике сохранится; при сильном изменении геометрии комнаты проверьте размещения в 3D.";
    if (!confirm(warn)) return;
    setWizardStep("plan");
  }

  function bumpIframe() {
    setIframeKey((k) => k + 1);
  }

  const persistLayout = useCallback(async (layout: GalleryLayout) => {
    setSaveStatus("saving");
    setSaveError("");
    try {
      const res = await fetch("/api/admin/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(layout),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error) || "Save failed");
      setCatalog((prev) =>
        prev
          ? { ...data.catalog, layout: ensureLayout(data.catalog.layout) }
          : data.catalog,
      );
      layoutRef.current = ensureLayout(data.layout);
      setDirty(Boolean(data.dirty));
      setSaveStatus("saved");
      bumpIframe();
    } catch (e) {
      setSaveStatus("error");
      setSaveError(e instanceof Error ? e.message : "Autosave failed");
    }
  }, []);

  const scheduleLayoutSave = useCallback(
    (layout: GalleryLayout) => {
      pendingLayout.current = layout;
      layoutRef.current = layout;
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout),
      });
      setDirty(false);
      setLiveUpdatedAt(data.catalog.updatedAt || "");
      bumpIframe();
      setMessage("Published to live site");
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
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reorder failed");
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout ?? catalog?.layout),
      });
      setDirty(true);
      bumpIframe();
      setMessage("Order saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function reorderPublished(publishedIds: string[]) {
    if (!catalog) return;
    const pubSet = new Set(publishedIds);
    const unpublished = catalog.artworks
      .filter((a) => !pubSet.has(a.id))
      .sort((a, b) => a.sort - b.sort)
      .map((a) => a.id);
    await reorder([...publishedIds, ...unpublished]);
  }

  async function move(id: string, dir: -1 | 1) {
    const ids = allArts.map((a) => a.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await reorder(ids);
  }

  async function saveArtwork(artwork: Artwork) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/artworks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(artwork),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error) || "Save failed");
      setCatalog({
        ...data.catalog,
        layout: ensureLayout(data.catalog.layout ?? catalog?.layout),
      });
      setDirty(true);
      setEditing(null);
      bumpIframe();
      setMessage("Saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function removeArtwork(id: string) {
    if (!confirm("Delete this artwork?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/artworks/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      const nextLayout = ensureLayout(catalog?.layout);
      nextLayout.placements = nextLayout.placements.filter(
        (p) => p.artworkId !== id,
      );
      setCatalog({
        ...data.catalog,
        layout: nextLayout,
      });
      scheduleLayoutSave(nextLayout);
      bumpIframe();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(art: Artwork) {
    await saveArtwork({ ...art, published: !art.published });
  }

  function startNew(type: Artwork["type"]) {
    setEditing({
      id: crypto.randomUUID(),
      type,
      sort: catalog?.artworks.length ?? 0,
      published: true,
      title: emptyLocalized(),
      text: emptyLocalized(),
      urlWall: "",
      urlFull: "",
      urlVideo: "",
      urlPoster: "",
      modelUrl: "",
      frameId: type === "model" ? "none" : "wood",
    });
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
            onClick={() => startNew("image")}
          >
            + Image
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => startNew("video")}
          >
            + Video
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => startNew("model")}
          >
            + Sculpture
          </button>
          {wizardStep === "place3d" ? (
            <button
              type="button"
              className="btn btn-solid"
              disabled={busy || (!dirty && saveStatus !== "error")}
              title="Publish live catalog from this draft"
              onClick={() => void publishLive()}
            >
              Опубликовать на сайт
              {dirty ? " ·" : ""}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              disabled
              title="Подтвердите план и расставьте работы в 3D"
            >
              Опубликовать на сайт (шаг 2)
            </button>
          )}
        </div>
      </div>

      <p className="mb-4 text-sm text-[var(--paper-dim)]">
        Draft autosaves on every layout change.
        {liveUpdatedAt
          ? ` Last live publish: ${new Date(liveUpdatedAt).toLocaleString()}.`
          : ""}
        {dirty ? " Unpublished draft changes." : " Live matches draft."}
      </p>

      {message ? (
        <p className="mb-4 text-sm text-[var(--amber-bright)]">{message}</p>
      ) : null}

      {wizardStep === "plan" ? (
        <div className="mb-8">
          <GalleryRoomEditor
            layout={layout}
            onLayoutChange={scheduleLayoutSave}
            saveStatus={saveStatus}
            saveError={saveError}
            onRetrySave={retrySave}
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-solid"
              disabled={layout.rooms.length < 1}
              onClick={() => setWizardStep("place3d")}
            >
              Далее: расстановка в 3D
            </button>
            {layout.rooms.length < 1 ? (
              <span className="text-sm text-[#e08a7a]">
                Нужна хотя бы одна комната.
              </span>
            ) : null}
          </div>
          <div className="mt-8 border border-[var(--line)] bg-[#1a1612]">
            <div className="border-b border-[var(--line)] px-4 py-2 text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
              Draft preview · {locale.toUpperCase()}
            </div>
            {planPreviewSrc ? (
              <iframe
                key={`draft-${iframeKey}-${locale}-${token}`}
                title="Draft exhibition preview"
                src={planPreviewSrc}
                className="h-[320px] w-full bg-black"
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center text-[var(--paper-dim)]">
                Loading…
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="mb-8">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={goBackToPlan}
            >
              Назад к плану
            </button>
            <span className="text-sm text-[var(--paper-dim)]">
              Шаг 2 · Unity WebGL · autosave placements
            </span>
          </div>
          {catalog && token ? (
            <AdminBuildBridge
              catalog={catalog}
              layout={layout}
              locale={locale}
              token={token}
              iframeKey={iframeKey}
              onLayoutChange={scheduleLayoutSave}
            />
          ) : (
            <p className="text-[var(--paper-dim)]">Loading admin build…</p>
          )}
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
          Artworks ({allArts.length})
        </h2>
        <p className="mb-4 text-sm text-[var(--paper-dim)]">
          Upload, publish toggle, and delete. After confirming the room plan,
          place published works in 3D on step 2.
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
                <div className="h-14 w-14 shrink-0 overflow-hidden bg-[#0e0c0a]">
                  {art.type === "model" ? (
                    <div className="flex h-full items-center justify-center text-[0.65rem] text-[var(--paper-dim)]">
                      GLB
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={art.urlWall || art.urlPoster || ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
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
                      setEditing(art);
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
  onCancel,
  onSave,
  onBusy,
  onMessage,
}: {
  artwork: Artwork;
  busy: boolean;
  onCancel: () => void;
  onSave: (a: Artwork) => Promise<void>;
  onBusy: (v: boolean) => void;
  onMessage: (m: string) => void;
}) {
  const [draft, setDraft] = useState<Artwork>(artwork);

  function setLocalized(
    field: "title" | "text",
    locale: keyof LocalizedString,
    value: string,
  ) {
    setDraft((d) => ({
      ...d,
      [field]: { ...d[field], [locale]: value },
    }));
  }

  async function onImageFile(file: File | null) {
    if (!file) return;
    if (file.size > IMAGE_MAX) {
      onMessage("Image exceeds 8MB");
      return;
    }
    onBusy(true);
    onMessage("Processing image…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/admin/process-image", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Process failed");
      setDraft((d) => ({
        ...d,
        urlWall: data.urlWall,
        urlFull: data.urlFull,
      }));
      onMessage("Image processed");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error");
    } finally {
      onBusy(false);
    }
  }

  async function onVideoFile(file: File | null) {
    if (!file) return;
    if (file.size > VIDEO_MAX) {
      onMessage("Video exceeds 80MB");
      return;
    }
    onBusy(true);
    onMessage("Uploading video…");
    try {
      try {
        const { upload } = await import("@vercel/blob/client");
        const pathname = `uploads/video/${crypto.randomUUID()}.mp4`;
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/admin/upload-token",
          contentType: "video/mp4",
        });
        setDraft((d) => ({ ...d, urlVideo: blob.url }));
        onMessage("Video uploaded");
        return;
      } catch {
        /* local fallback */
      }
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "video");
      const res = await fetch("/api/admin/upload-token", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDraft((d) => ({ ...d, urlVideo: data.url }));
      onMessage("Video uploaded");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error");
    } finally {
      onBusy(false);
    }
  }

  async function onModelFile(file: File | null) {
    if (!file) return;
    if (file.size > MODEL_MAX) {
      onMessage("GLB exceeds 40MB");
      return;
    }
    onBusy(true);
    onMessage("Uploading sculpture GLB…");
    try {
      try {
        const { upload } = await import("@vercel/blob/client");
        const pathname = `uploads/model/${crypto.randomUUID()}.glb`;
        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/admin/upload-token",
          contentType: "model/gltf-binary",
        });
        setDraft((d) => ({ ...d, type: "model", modelUrl: blob.url }));
        onMessage("GLB uploaded");
        return;
      } catch {
        /* local fallback */
      }
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "model");
      const res = await fetch("/api/admin/upload-token", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      setDraft((d) => ({ ...d, type: "model", modelUrl: data.url }));
      onMessage("GLB uploaded");
    } catch (e) {
      onMessage(e instanceof Error ? e.message : "Error");
    } finally {
      onBusy(false);
    }
  }

  async function onPosterFile(file: File | null) {
    if (!file) return;
    if (file.size > IMAGE_MAX) {
      onMessage("Poster exceeds 8MB");
      return;
    }
    onBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const data = await (
        await fetch("/api/admin/process-image", { method: "POST", body: form })
      ).json();
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
      <div className="my-8 w-full max-w-2xl border border-[var(--line)] bg-[#161310] p-6">
        <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-bold">
          Edit {draft.type}
        </h2>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {LOCALES.map((locale) => (
            <div key={`title-${locale}`}>
              <label>Title ({locale})</label>
              <input
                value={draft.title[locale]}
                onChange={(e) => setLocalized("title", locale, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {LOCALES.map((locale) => (
            <div key={`text-${locale}`}>
              <label>Text ({locale})</label>
              <textarea
                rows={3}
                value={draft.text[locale]}
                onChange={(e) => setLocalized("text", locale, e.target.value)}
              />
            </div>
          ))}
        </div>
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
        {draft.type === "image" ? (
          <div className="mb-4">
            <label>Image (max 8MB)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onImageFile(e.target.files?.[0] || null)}
            />
          </div>
        ) : draft.type === "video" ? (
          <>
            <div className="mb-4">
              <label>Video MP4</label>
              <input
                type="file"
                accept="video/mp4,.mp4"
                onChange={(e) => onVideoFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="mb-4">
              <label>Poster</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => onPosterFile(e.target.files?.[0] || null)}
              />
            </div>
          </>
        ) : (
          <div className="mb-4">
            <label>Sculpture GLB (max 40MB)</label>
            <input
              type="file"
              accept=".glb,model/gltf-binary"
              onChange={(e) => onModelFile(e.target.files?.[0] || null)}
            />
            {draft.modelUrl ? (
              <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
                {draft.modelUrl}
              </p>
            ) : null}
          </div>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            className="btn btn-solid"
            disabled={busy}
            onClick={() => onSave(draft)}
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
