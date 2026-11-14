"use client";

import { useCallback, useEffect, useState } from "react";
import type { Artwork, Catalog, LocalizedString } from "@/lib/catalog-types";
import { emptyLocalized, LOCALES } from "@/lib/catalog-types";

const IMAGE_MAX = 8 * 1024 * 1024;
const VIDEO_MAX = 80 * 1024 * 1024;

export function ArtworksManager() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Artwork | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/artworks");
    if (!res.ok) throw new Error("Failed to load");
    setCatalog(await res.json());
  }, []);

  useEffect(() => {
    refresh().catch((e) => setMessage(String(e)));
  }, [refresh]);

  async function publishCatalog() {
    if (!confirm("Publish draft catalog to live?")) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/publish", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Publish failed");
      setCatalog(data.catalog);
      setMessage(`Published v${data.catalog.version}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
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
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(art: Artwork) {
    await saveArtwork({ ...art, published: !art.published });
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
      const res = await fetch("/api/admin/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reorder failed");
      setCatalog(data.catalog);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  function startNew(type: "image" | "video") {
    setEditing({
      id: crypto.randomUUID(),
      type,
      sort: catalog?.artworks.length ?? 0,
      published: false,
      title: emptyLocalized(),
      text: emptyLocalized(),
      urlWall: "",
      urlFull: "",
      urlVideo: "",
      urlPoster: "",
    });
  }

  if (!catalog) {
    return <p className="text-[var(--paper-dim)]">Loading…</p>;
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
            className="btn btn-solid"
            disabled={busy}
            onClick={publishCatalog}
          >
            Publish catalog
          </button>
        </div>
      </div>

      {message ? (
        <p className="mb-4 text-sm text-[var(--amber-bright)]">{message}</p>
      ) : null}

      <ul className="space-y-3">
        {catalog.artworks.map((art) => (
          <li
            key={art.id}
            className="flex flex-wrap items-center gap-3 border border-[var(--line)] bg-[#1a1612] p-4"
          >
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
                {art.title.en || "(untitled)"}{" "}
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
                onClick={() => move(art.id, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                onClick={() => move(art.id, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.65rem]"
                onClick={() => togglePublished(art)}
              >
                {art.published ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                className="btn !py-1 !px-2 !text-[0.65rem]"
                onClick={() => setEditing(art)}
              >
                Edit
              </button>
              <button
                type="button"
                className="btn btn-danger !py-1 !px-2 !text-[0.65rem]"
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
          No artworks yet. Add an image or video to grow the room.
        </p>
      ) : null}

      {editing ? (
        <ArtworkEditor
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

function ArtworkEditor({
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
    if (!file.type.includes("mp4") && !file.name.endsWith(".mp4")) {
      onMessage("Video must be MP4 (H.264)");
      return;
    }
    onBusy(true);
    onMessage("Uploading video…");
    try {
      // Prefer direct Blob client upload; fall back to local multipart.
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
      const res = await fetch("/api/admin/process-image", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Process failed");
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
            id="published"
            type="checkbox"
            checked={draft.published}
            onChange={(e) =>
              setDraft((d) => ({ ...d, published: e.target.checked }))
            }
            className="!w-auto"
          />
          <label htmlFor="published" className="!mb-0 !normal-case !tracking-normal">
            Published in catalog
          </label>
        </div>

        {draft.type === "image" ? (
          <div className="mb-4">
            <label>Image (max 8MB → wall 1024 + full 2048 WebP)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onImageFile(e.target.files?.[0] || null)}
            />
            {draft.urlWall ? (
              <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
                wall: {draft.urlWall}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-4">
              <label>Video MP4 (max 80MB)</label>
              <input
                type="file"
                accept="video/mp4,.mp4"
                onChange={(e) => onVideoFile(e.target.files?.[0] || null)}
              />
              {draft.urlVideo ? (
                <p className="mt-2 truncate text-xs text-[var(--paper-dim)]">
                  {draft.urlVideo}
                </p>
              ) : null}
            </div>
            <div className="mb-4">
              <label>Poster image</label>
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
