"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Artwork, Catalog } from "@/lib/catalog-types";
import {
  UI,
  direction,
  isLocale,
  pickLocalized,
  type Locale,
} from "@/lib/i18n";
import { LangSwitcher } from "@/components/lang-switcher";
import { GalleryScene } from "./gallery-scene";

export function ExhibitionApp({
  unityAvailable = false,
}: {
  unityAvailable?: boolean;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Artwork | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [imageOverlay, setImageOverlay] = useState<string | null>(null);
  const [videoOverlay, setVideoOverlay] = useState<{
    url: string;
    poster?: string;
  } | null>(null);
  const [catalogKind, setCatalogKind] = useState<"live" | "draft">("live");
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lang = params.get("lang");
    const stored = localStorage.getItem("gallery-lang");
    if (isLocale(lang)) setLocale(lang);
    else if (isLocale(stored)) setLocale(stored);

    const kind = params.get("catalog") === "draft" ? "draft" : "live";
    const tok = params.get("token");
    setCatalogKind(kind);
    setToken(tok);

    const qs = new URLSearchParams({ catalog: kind });
    if (tok) qs.set("token", tok);

    fetch(`/api/catalog?${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Forbidden" : "Failed");
        return r.json();
      })
      .then(setCatalog)
      .catch((e) => setError(e instanceof Error ? e.message : "Error"));
  }, []);

  useEffect(() => {
    localStorage.setItem("gallery-lang", locale);
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setImageOverlay(null);
        setVideoOverlay(null);
        setInfoOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const artworks = useMemo(() => {
    if (!catalog) return [];
    // Live API already returns published-only; draft preview matches schematic (published).
    return catalog.artworks
      .filter((a) => a.published)
      .sort((a, b) => a.sort - b.sort);
  }, [catalog]);

  const copy = UI[locale];

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black px-6 text-center">
        <div>
          <p className="mb-4 text-[#e08a7a]">{error}</p>
          <Link href="/" className="btn">
            Home
          </Link>
        </div>
      </div>
    );
  }

  if (!catalog) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-[var(--paper-dim)]">
        Loading exhibition…
      </div>
    );
  }

  return (
    <div
      dir={direction(locale)}
      className="relative h-[100dvh] w-full overflow-hidden bg-black"
    >
      {/* Single chrome layer: HTML owns exit + lang when Unity is embedded (Unity skips its lang row). */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto justify-self-start">
          <Link
            href="/"
            className="btn btn-ghost !border-white/20 !py-1.5 !px-3 !text-[0.65rem] !normal-case !tracking-wide !text-white/80"
          >
            {copy.exit}
          </Link>
        </div>
        <span className="pointer-events-none justify-self-center font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-white/90">
          Atelier
        </span>
        <div className="pointer-events-auto justify-self-end rounded bg-black/40 px-2 py-1 backdrop-blur-sm">
          <LangSwitcher value={locale} onChange={setLocale} />
        </div>
      </div>

      {unityAvailable ? (
        <UnityEmbed catalogKind={catalogKind} token={token} lang={locale} />
      ) : (
        <GalleryScene
          artworks={artworks}
          locale={locale}
          emptyLabel={copy.emptyRoom}
          onSelect={setSelected}
          onOpenImage={(url) => setImageOverlay(url)}
          onOpenVideo={(url, poster) => setVideoOverlay({ url, poster })}
          onOpenInfo={() => setInfoOpen(true)}
        />
      )}

      {/* Selection chrome is Unity-owned when embedded; HTML only for Three.js stub. */}
      {!unityAvailable && selected && !infoOpen && !imageOverlay && !videoOverlay ? (
        <div className="absolute bottom-24 start-1/2 z-20 flex -translate-x-1/2 gap-2 sm:bottom-8">
          <button
            type="button"
            className="btn btn-solid !py-2"
            onClick={() => setInfoOpen(true)}
          >
            {copy.info}
          </button>
          {selected.type === "video" && selected.urlVideo ? (
            <button
              type="button"
              className="btn !py-2"
              onClick={() =>
                setVideoOverlay({
                  url: selected.urlVideo,
                  poster: selected.urlPoster,
                })
              }
            >
              ▶
            </button>
          ) : null}
        </div>
      ) : null}

      {!unityAvailable && infoOpen && selected ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto border border-[var(--line)] bg-[#12100e] p-6">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-bold">
              {pickLocalized(selected.title, locale)}
            </h2>
            <p className="whitespace-pre-wrap leading-relaxed text-[var(--paper-dim)]">
              {pickLocalized(selected.text, locale)}
            </p>
            <button
              type="button"
              className="btn mt-6"
              onClick={() => setInfoOpen(false)}
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}

      {imageOverlay ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setImageOverlay(null)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageOverlay}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
          <button
            type="button"
            className="btn absolute end-4 top-4"
            onClick={() => setImageOverlay(null)}
          >
            {copy.close}
          </button>
        </div>
      ) : null}

      {videoOverlay ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black p-2">
          <video
            src={videoOverlay.url}
            poster={videoOverlay.poster}
            controls
            playsInline
            autoPlay
            className="max-h-full max-w-full"
          />
          <button
            type="button"
            className="btn absolute end-4 top-4"
            onClick={() => setVideoOverlay(null)}
          >
            {copy.close}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function UnityEmbed({
  catalogKind,
  token,
  lang,
}: {
  catalogKind: string;
  token: string | null;
  lang: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.dataset.catalog = catalogKind;
    el.dataset.token = token || "";
    el.dataset.lang = lang;
  }, [catalogKind, token, lang]);

  const qs = new URLSearchParams({ catalog: catalogKind, lang });
  if (token) qs.set("token", token);

  return (
    <div ref={ref} id="unity-canvas-wrap" className="h-full w-full">
      <iframe
        title="Unity gallery"
        key={`unity-${catalogKind}-${lang}-${token || "live"}`}
        src={`/unity/index.html?${qs.toString()}`}
        className="h-full w-full border-0"
        allow="autoplay; fullscreen"
      />
    </div>
  );
}
