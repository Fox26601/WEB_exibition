"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BookletPage, Catalog, CatalogSettings } from "@/lib/catalog-types";
import {
  emptyBookletPage,
  nextBookletPageKey,
  normalizeSettings,
} from "@/lib/catalog-types";
import { adminFetch, readAdminJson } from "@/lib/admin-api";
import { fillSettingsLocales } from "@/lib/admin-translate-client";
import { LocalizedAutoFields } from "./localized-auto-fields";

const AUTOSAVE_MS = 700;

function settingsSnapshot(settings: CatalogSettings): string {
  return JSON.stringify(normalizeSettings(settings));
}

export function SettingsForm() {
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [posterBusy, setPosterBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True only after a real user edit (onChange / add/remove / poster upload). */
  const dirty = useRef(false);
  const lastSavedJson = useRef("");
  const pendingSettings = useRef<CatalogSettings | null>(null);

  function applyServerSettings(next: CatalogSettings) {
    const normalized = normalizeSettings(next);
    lastSavedJson.current = settingsSnapshot(normalized);
    dirty.current = false;
    pendingSettings.current = null;
    setSettings(normalized);
  }

  function markUserEdit(next: CatalogSettings) {
    dirty.current = true;
    pendingSettings.current = next;
    return next;
  }

  useEffect(() => {
    adminFetch("/api/admin/settings")
      .then(async (r) => {
        const data = await readAdminJson<CatalogSettings>(
          r,
          "Settings load failed",
        );
        applyServerSettings(data);
      })
      .catch((e) => {
        setMessage(e instanceof Error ? e.message : "Failed to load settings");
        setSettings(null);
      });
  }, []);

  const persist = useCallback(async (next: CatalogSettings, label: string) => {
    try {
      const filled = await fillSettingsLocales(normalizeSettings(next));
      const json = settingsSnapshot(filled);
      // No-op when payload matches last load/save — avoids toast + refetch loops.
      if (json === lastSavedJson.current) {
        dirty.current = false;
        pendingSettings.current = null;
        return;
      }
      setBusy(true);
      setMessage("");
      const res = await adminFetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: json,
      });
      const data = await readAdminJson<{ settings: CatalogSettings }>(
        res,
        "Settings save failed",
      );
      applyServerSettings(data.settings);
      setMessage(label);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }, []);

  async function publishCatalog() {
    if (!confirm("Publish draft catalog (including settings) to live?")) return;
    setBusy(true);
    setMessage("");
    try {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      const pending = pendingSettings.current ?? settings;
      if (pending) {
        const filled = await fillSettingsLocales(normalizeSettings(pending));
        const json = settingsSnapshot(filled);
        if (json !== lastSavedJson.current) {
          const saveRes = await adminFetch("/api/admin/settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: json,
          });
          await readAdminJson(saveRes, "Settings save failed");
          lastSavedJson.current = json;
        }
        dirty.current = false;
        pendingSettings.current = null;
      }
      const res = await adminFetch("/api/admin/publish", { method: "POST" });
      const data = await readAdminJson<{ catalog: Catalog }>(
        res,
        "Publish failed",
      );
      if (data.catalog?.settings) {
        applyServerSettings(data.catalog.settings);
      }
      setMessage(`Published v${data.catalog.version} to live`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!settings || !dirty.current) return;
    const json = settingsSnapshot(settings);
    if (json === lastSavedJson.current) {
      dirty.current = false;
      pendingSettings.current = null;
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (!dirty.current) return;
      void persist(
        settings,
        "Settings autosaved (draft). Publish catalog to push live.",
      );
    }, AUTOSAVE_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [settings, persist]);

  function patch(partial: Partial<CatalogSettings>) {
    setSettings((prev) => {
      if (!prev) return prev;
      return markUserEdit({ ...prev, ...partial });
    });
  }

  function updateBookletPage(index: number, page: BookletPage) {
    setSettings((prev) => {
      if (!prev) return prev;
      const booklet = prev.entrance.booklet.slice();
      booklet[index] = page;
      return markUserEdit({
        ...prev,
        entrance: { ...prev.entrance, booklet },
      });
    });
  }

  function addBookletPage() {
    setSettings((prev) => {
      if (!prev) return prev;
      const key = nextBookletPageKey(prev.entrance.booklet);
      return markUserEdit({
        ...prev,
        entrance: {
          ...prev.entrance,
          booklet: [...prev.entrance.booklet, emptyBookletPage(key)],
        },
      });
    });
  }

  function removeBookletPage(index: number) {
    setSettings((prev) => {
      if (!prev) return prev;
      const booklet = prev.entrance.booklet.filter((_, i) => i !== index);
      return markUserEdit({
        ...prev,
        entrance: {
          ...prev.entrance,
          booklet: booklet.length
            ? booklet
            : [emptyBookletPage(nextBookletPageKey([]))],
        },
      });
    });
  }

  async function onPosterFile(file: File | null) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setMessage("Poster exceeds 8MB");
      return;
    }
    setPosterBusy(true);
    setMessage("Uploading entrance poster…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await adminFetch("/api/admin/process-image", {
        method: "POST",
        body: form,
      });
      const data = await readAdminJson<{
        urlFull?: string;
        urlWall?: string;
      }>(res, "Process failed");
      const posterUrl = data.urlFull || data.urlWall || "";
      setSettings((prev) => {
        if (!prev) return prev;
        return markUserEdit({
          ...prev,
          entrance: { ...prev.entrance, posterUrl },
        });
      });
      setMessage("Entrance poster set (draft).");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setPosterBusy(false);
    }
  }

  if (!settings) {
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
      <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-bold">
        Settings
      </h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          Poster tagline
        </h2>
        <LocalizedAutoFields
          label="Poster"
          values={settings.poster}
          onChange={(poster) => patch({ poster })}
          onApplyTranslations={(merge) =>
            setSettings((prev) => {
              if (!prev) return prev;
              return markUserEdit({ ...prev, poster: merge(prev.poster) });
            })
          }
        />
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        <div>
          <label>Instagram URL</label>
          <input
            value={settings.instagram}
            onChange={(e) => patch({ instagram: e.target.value })}
          />
        </div>
        <div>
          <label>Email</label>
          <input
            value={settings.email}
            onChange={(e) => patch({ email: e.target.value })}
          />
        </div>
        <p className="sm:col-span-2 text-xs text-[var(--paper-dim)]">
          Exhibition footer Contact uses email + Instagram here; Review
          submissions are stored with this email as destination metadata.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          Bio / CV
        </h2>
        <LocalizedAutoFields
          label="Bio"
          multiline
          rows={5}
          values={settings.bio}
          onChange={(bio) => patch({ bio })}
          onApplyTranslations={(merge) =>
            setSettings((prev) => {
              if (!prev) return prev;
              return markUserEdit({ ...prev, bio: merge(prev.bio) });
            })
          }
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          Entrance poster
        </h2>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept="image/*"
            disabled={posterBusy}
            onChange={(e) => void onPosterFile(e.target.files?.[0] ?? null)}
          />
          {settings.entrance.posterUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={settings.entrance.posterUrl}
              alt=""
              className="h-20 w-auto border border-[var(--line)] object-cover"
            />
          ) : null}
        </div>
        <label>Poster URL</label>
        <input
          value={settings.entrance.posterUrl}
          onChange={(e) =>
            patch({
              entrance: { ...settings.entrance, posterUrl: e.target.value },
            })
          }
        />
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
            Exhibition booklet
          </h2>
          <button type="button" className="btn !py-1.5 !text-xs" onClick={addBookletPage}>
            Add page
          </button>
        </div>
        <div className="space-y-6">
          {settings.entrance.booklet.map((page, index) => (
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
                {settings.entrance.booklet.length > 1 ? (
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
                    setSettings((prev) => {
                      if (!prev) return prev;
                      const booklet = prev.entrance.booklet.slice();
                      const current = booklet[index];
                      if (!current) return prev;
                      booklet[index] = {
                        ...current,
                        title: merge(current.title),
                      };
                      return markUserEdit({
                        ...prev,
                        entrance: { ...prev.entrance, booklet },
                      });
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
                  setSettings((prev) => {
                    if (!prev) return prev;
                    const booklet = prev.entrance.booklet.slice();
                    const current = booklet[index];
                    if (!current) return prev;
                    booklet[index] = {
                      ...current,
                      body: merge(current.body),
                    };
                    return markUserEdit({
                      ...prev,
                      entrance: { ...prev.entrance, booklet },
                    });
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          About artist
        </h2>
        <p className="mb-3 text-xs text-[var(--paper-dim)]">
          Shown in the exhibition footer Contact modal (Artist section).
        </p>
        <LocalizedAutoFields
          label="About artist"
          multiline
          values={settings.aboutArtist}
          onChange={(aboutArtist) => patch({ aboutArtist })}
          onApplyTranslations={(merge) =>
            setSettings((prev) => {
              if (!prev) return prev;
              return markUserEdit({
                ...prev,
                aboutArtist: merge(prev.aboutArtist),
              });
            })
          }
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          About curator
        </h2>
        <p className="mb-3 text-xs text-[var(--paper-dim)]">
          Shown in the exhibition footer Contact modal (Curator section).
        </p>
        <LocalizedAutoFields
          label="About curator"
          multiline
          values={settings.aboutCurator}
          onChange={(aboutCurator) => patch({ aboutCurator })}
          onApplyTranslations={(merge) =>
            setSettings((prev) => {
              if (!prev) return prev;
              return markUserEdit({
                ...prev,
                aboutCurator: merge(prev.aboutCurator),
              });
            })
          }
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          Donate
        </h2>
        <div className="mb-3">
          <label>Donate URL</label>
          <input
            value={settings.donate.url}
            onChange={(e) =>
              patch({
                donate: { ...settings.donate, url: e.target.value },
              })
            }
          />
        </div>
        <LocalizedAutoFields
          label="Donate text"
          multiline
          rows={3}
          values={settings.donate.text}
          onChange={(text) =>
            patch({ donate: { ...settings.donate, text } })
          }
          onApplyTranslations={(merge) =>
            setSettings((prev) => {
              if (!prev) return prev;
              return markUserEdit({
                ...prev,
                donate: {
                  ...prev.donate,
                  text: merge(prev.donate.text),
                },
              });
            })
          }
        />
      </section>

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

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-solid"
          disabled={busy}
          onClick={() =>
            void persist(
              settings,
              "Settings saved (draft). Publish catalog to push live.",
            )
          }
        >
          Save settings
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => void publishCatalog()}
        >
          Publish to live
        </button>
        <Link
          href="/admin/preview"
          className="text-sm text-[var(--amber-bright)] underline-offset-2 hover:underline"
        >
          Open Layout
        </Link>
      </div>
    </div>
  );
}
