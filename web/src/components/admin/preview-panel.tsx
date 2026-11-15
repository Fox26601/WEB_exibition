"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Artwork, Catalog, LocalizedString } from "@/lib/catalog-types";
import { emptyLocalized, LOCALES } from "@/lib/catalog-types";
import { LangSwitcher } from "@/components/lang-switcher";
import { isLocale, type Locale } from "@/lib/i18n";
import { RoomSchematic } from "./room-schematic";

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 80 * 1024 * 1024;

export function PreviewPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Artwork | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [locale, setLocale] = useState<Locale>("en");
  const [iframeKey, setIframeKey] = useState(0);

  const refresh = useCallback(async () => {
    const [catRes, tokRes] = await Promise.all([
      fetch("/api/catalog?catalog=draft"),
      fetch("/api/admin/preview-token", { method: "POST" }),
    ]);
    if (!catRes.ok || !tokRes.ok) throw new Error("Failed to load preview");
    const cat = (await catRes.json()) as Catalog;
    const tok = await tokRes.json();
    setCatalog(cat);
    setToken(tok.token);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("gallery-lang");
    if (isLocale(stored)) setLocale(stored);
    refresh().catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem("gallery-lang", locale);
  }, [locale]);

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

  const iframeSrc = token
    ? `/exhibition?catalog=draft&token=${encodeURIComponent(token)}&lang=${locale}`
    : "";

  function bumpIframe() {
    setIframeKey((k) => k + 1);
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
      setCatalog(data.catalog);
      bumpIframe();
      setMessage("Order saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  /** Reorder only among published list, then merge back into full draft order. */
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
      setCatalog(data.catalog);
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
      setCatalog(data.catalog);
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

  function startNew(type: "image" | "video") {
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
    });
  }

  if (error) {
    return <p className="text-[#e08a7a]">{error}</p>;
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold">
          Preview
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
        </div>
      </div>

      {message ? (
        <p className="mb-4 text-sm text-[var(--amber-bright)]">{message}</p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <RoomSchematic
          artworks={publishedArts}
          highlightedId={highlightedId}
          onSelect={setHighlightedId}
          onReorder={busy ? undefined : reorderPublished}
        />
        <div className="border border-[var(--line)] bg-[#1a1612]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2 text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
            <span>Exhibition draft iframe · {locale.toUpperCase()}</span>
          </div>
          {iframeSrc ? (
            <iframe
              key={`draft-${iframeKey}-${locale}-${token}`}
              title="Draft exhibition"
              src={iframeSrc}
              className="h-[420px] w-full bg-black"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center text-[var(--paper-dim)]">
              Loading…
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
          Artworks ({allArts.length})
        </h2>
        <p className="mb-4 text-sm text-[var(--paper-dim)]">
          Numbers match the schematic for published works. Drag slots above or use ↑↓
          to change order; upload and delete here.
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={art.urlWall || art.urlPoster || ""}
                    alt=""
                    className="h-full w-full object-cover"
                  />
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
            No artworks yet. Add an image or video.
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
        ) : (
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
