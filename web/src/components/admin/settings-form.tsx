"use client";

import { useEffect, useState } from "react";
import type { CatalogSettings } from "@/lib/catalog-types";
import { LOCALES, emptyLocalized } from "@/lib/catalog-types";

export function SettingsForm() {
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() =>
        setSettings({
          poster: emptyLocalized(),
          instagram: "",
          email: "",
          bio: emptyLocalized(),
        }),
      );
  }, []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(data.error));
      setSettings(data.settings);
      setMessage("Settings saved (draft). Publish catalog to push live.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return <p className="text-[var(--paper-dim)]">Loading…</p>;
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
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCALES.map((locale) => (
            <div key={`poster-${locale}`}>
              <label>Poster ({locale})</label>
              <input
                value={settings.poster[locale]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    poster: { ...settings.poster, [locale]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mb-8 grid gap-3 sm:grid-cols-2">
        <div>
          <label>Instagram URL</label>
          <input
            value={settings.instagram}
            onChange={(e) =>
              setSettings({ ...settings, instagram: e.target.value })
            }
          />
        </div>
        <div>
          <label>Email</label>
          <input
            value={settings.email}
            onChange={(e) =>
              setSettings({ ...settings, email: e.target.value })
            }
          />
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
          Bio / CV
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {LOCALES.map((locale) => (
            <div key={`bio-${locale}`}>
              <label>Bio ({locale})</label>
              <textarea
                rows={5}
                value={settings.bio[locale]}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    bio: { ...settings.bio, [locale]: e.target.value },
                  })
                }
              />
            </div>
          ))}
        </div>
      </section>

      {message ? (
        <p className="mb-4 text-sm text-[var(--amber-bright)]">{message}</p>
      ) : null}

      <button
        type="button"
        className="btn btn-solid"
        disabled={busy}
        onClick={save}
      >
        Save settings
      </button>
    </div>
  );
}
