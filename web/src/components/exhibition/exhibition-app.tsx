"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Artwork, Catalog } from "@/lib/catalog-types";
import {
  advanceBookletPageIndex,
  normalizeArtwork,
  normalizeArtworkBooklet,
  normalizeSettings,
  sameCatalogRevision,
} from "@/lib/catalog-types";
import { UI, pickLocalized } from "@/lib/i18n";
import { useGalleryLocale } from "@/lib/use-gallery-locale";
import { LangSwitcher } from "@/components/lang-switcher";
import { shouldCompositeHeldMapOverMedia } from "@/lib/gallery-three/booklet-interact";
import { usePresenceSession } from "@/lib/presence/use-presence-session";
import { GalleryScene3D } from "./gallery-scene-3d";
import { BookletOverlay } from "./booklet-overlay";
import { BusyQueueOverlay } from "./busy-queue-overlay";
import { ModelViewOverlay } from "./model-view-overlay";

type InfoModal = "artist" | "curator" | "donate" | "links" | null;
type FooterModal = "review" | "contact" | null;
type ReviewStatus = "idle" | "sending" | "success" | "error";

const SITE_BY_URL = "https://webgalerey.app";

function openArtworkFullscreen(
  art: Artwork,
  setImage: (url: string | null) => void,
  setVideo: (v: { url: string; poster?: string } | null) => void,
  setModel: (url: string | null) => void,
) {
  if (art.type === "model" && art.modelUrl?.trim()) {
    setModel(art.modelUrl.trim());
    return;
  }
  if (art.type === "video" && art.urlVideo) {
    setVideo({ url: art.urlVideo, poster: art.urlPoster || undefined });
    return;
  }
  const src = art.urlFull || art.urlWall || art.urlPoster || "";
  if (src) setImage(src);
}

export function ExhibitionApp() {
  const { locale, setLocale, dir } = useGalleryLocale();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Artwork | null>(null);
  const [imageOverlay, setImageOverlay] = useState<string | null>(null);
  const [videoOverlay, setVideoOverlay] = useState<{
    url: string;
    poster?: string;
  } | null>(null);
  const [modelOverlay, setModelOverlay] = useState<string | null>(null);
  const [previewLite, setPreviewLite] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const [bookletOpen, setBookletOpen] = useState(false);
  const [bookletPage, setBookletPage] = useState(0);
  const [bookletOwned, setBookletOwned] = useState(false);
  const [artBookletOpen, setArtBookletOpen] = useState(false);
  const [artBookletPage, setArtBookletPage] = useState(0);
  const [artBookletId, setArtBookletId] = useState<string | null>(null);
  const [footerModal, setFooterModal] = useState<FooterModal>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");
  const [adminBuild, setAdminBuild] = useState(false);
  const [catalogKind, setCatalogKind] = useState<"live" | "draft">("live");

  // Presence starts after catalog is ready; admin/build preview stays solo.
  const { ui: presenceUi, sceneApi: presenceScene, enterOffline } =
    usePresenceSession({
      adminBuild: adminBuild || previewLite,
      enabled: !!catalog,
    });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("catalog") === "draft" ? "draft" : "live";
    setCatalogKind(kind);
    const tok = params.get("token");
    const mode = params.get("mode");
    setPreviewLite(mode === "preview-lite");
    // Admin schematic / build preview — no Photon, no queue overlay.
    setAdminBuild(
      mode === "preview-lite" ||
        mode === "admin" ||
        params.get("adminBuild") === "1",
    );

    let cancelled = false;

    function loadCatalog(bust = false) {
      const qs = new URLSearchParams({ catalog: kind });
      if (tok) qs.set("token", tok);
      if (bust) qs.set("_", String(Date.now()));
      fetch(`/api/catalog?${qs}`, { cache: "no-store" })
        .then(async (r) => {
          if (!r.ok) throw new Error(r.status === 403 ? "Forbidden" : "Failed");
          return r.json();
        })
        .then((data: Catalog) => {
          if (cancelled) return;
          const next: Catalog = {
            ...data,
            settings: normalizeSettings(data.settings),
            artworks: (data.artworks || []).map((a) => normalizeArtwork(a)),
          };
          // Focus/visibility refetch must not replace catalog identity when the
          // revision is unchanged — that remounts GalleryScene3D and snaps spawn.
          setCatalog((prev) =>
            sameCatalogRevision(prev, next) ? prev : next,
          );
          setError("");
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : "Error");
        });
    }

    loadCatalog(false);

    const onVisible = () => {
      if (document.visibilityState === "visible") loadCatalog(true);
    };
    const onFocus = () => loadCatalog(true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Peel topmost layer first so booklet-over-View stays usable.
      if (artBookletOpen) {
        setArtBookletOpen(false);
        return;
      }
      if (bookletOpen) {
        setBookletOpen(false);
        return;
      }
      if (imageOverlay || videoOverlay || modelOverlay) {
        setImageOverlay(null);
        setVideoOverlay(null);
        setModelOverlay(null);
        return;
      }
      setInfoModal(null);
      setFooterModal(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [artBookletOpen, bookletOpen, imageOverlay, videoOverlay, modelOverlay]);

  // Held map page-turn (no HUD chrome) while raised in hands.
  useEffect(() => {
    if (!bookletOwned || !bookletOpen || artBookletOpen) return;
    const pages = catalog ? normalizeSettings(catalog.settings).entrance.booklet : [];
    if (pages.length <= 1) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setBookletPage((i) => advanceBookletPageIndex(i, -1, pages.length));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setBookletPage((i) => advanceBookletPageIndex(i, 1, pages.length));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bookletOwned, bookletOpen, artBookletOpen, catalog]);

  function openFooterModal(kind: FooterModal) {
    if (kind === "review") {
      setReviewStatus("idle");
    }
    setInfoModal(null);
    setFooterModal(kind);
  }

  async function submitReview(e: FormEvent) {
    e.preventDefault();
    if (reviewStatus === "sending") return;
    setReviewStatus("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reviewName,
          email: reviewEmail,
          message: reviewMessage,
        }),
      });
      if (!res.ok) throw new Error("failed");
      setReviewStatus("success");
      setReviewName("");
      setReviewEmail("");
      setReviewMessage("");
    } catch {
      setReviewStatus("error");
    }
  }

  // Draft admin preview must show unpublished placed works (Place palette parity).
  // Live catalog API already strips unpublished; keep a client filter as belt-and-suspenders.
  const artworks = useMemo(() => {
    if (!catalog) return [];
    const list =
      catalogKind === "draft"
        ? catalog.artworks
        : catalog.artworks.filter((a) => a.published);
    return [...list].sort((a, b) => a.sort - b.sort);
  }, [catalog, catalogKind]);

  const copy = UI[locale];
  const settings = catalog ? normalizeSettings(catalog.settings) : null;

  /** Look-away / Escape / spawn: drop art focus and art sheet; held map stays entrance pages. */
  function onSelectArtwork(art: Artwork | null) {
    setSelected(art);
    if (!art) {
      setArtBookletOpen(false);
      setArtBookletId(null);
      setArtBookletPage(0);
    }
  }

  function onBookletInteract(action: "pickup" | "toggle") {
    setArtBookletOpen(false);
    setArtBookletId(null);
    setArtBookletPage(0);
    if (action === "pickup") {
      setBookletOwned(true);
      setBookletPage(0);
      setBookletOpen(true);
      return;
    }
    setBookletOpen((open) => !open);
  }

  /** Compact art bottom sheet (Q when map not owned). Toggle same control. */
  function onOpenArtBooklet(artworkId: string) {
    const art =
      artworks.find((a) => a.id === artworkId) ||
      catalog?.artworks.find((a) => a.id === artworkId);
    if (!art) return;
    setSelected(art);
    // Lower held map while the art sheet is up (one primary read surface).
    setBookletOpen(false);
    if (artBookletOpen && artBookletId === artworkId) {
      setArtBookletOpen(false);
      return;
    }
    setArtBookletId(artworkId);
    setArtBookletPage(0);
    setArtBookletOpen(true);
  }

  /**
   * Single Map/Booklet chrome control — same rule as Q:
   * owned → raise/lower map (dismiss art sheet if open);
   * !owned + selected → toggle art bottom sheet.
   */
  function onToggleBookletControl() {
    if (bookletOwned) {
      if (artBookletOpen) {
        setArtBookletOpen(false);
        return;
      }
      setBookletOpen((open) => !open);
      return;
    }
    if (selected) onOpenArtBooklet(selected.id);
  }

  /** E / View: same control opens and closes fullscreen (image / video / model). */
  function onToggleFullscreen(art: Artwork | null) {
    if (imageOverlay || videoOverlay || modelOverlay) {
      setImageOverlay(null);
      setVideoOverlay(null);
      setModelOverlay(null);
      return;
    }
    if (!art) return;
    openArtworkFullscreen(
      art,
      setImageOverlay,
      setVideoOverlay,
      setModelOverlay,
    );
  }

  const artBookletPages = useMemo(() => {
    if (!artBookletId) return [];
    const art =
      artworks.find((a) => a.id === artBookletId) ||
      catalog?.artworks.find((a) => a.id === artBookletId);
    if (!art) return [];
    return normalizeArtworkBooklet(art);
  }, [artBookletId, artworks, catalog]);

  const mediaOpen = !!imageOverlay || !!videoOverlay || !!modelOverlay;
  /** Owned map = FP mesh only; raise canvas over View (no Map HUD sheet). */
  const compositeHeldMapOverMedia = shouldCompositeHeldMapOverMedia({
    mediaOpen,
    bookletOwned,
  });
  const bookletControlLabel =
    bookletOwned && !artBookletOpen ? copy.map : copy.booklet;
  const showBookletControl =
    bookletOwned || artBookletOpen || !!selected;

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

  if (!catalog || !settings) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-[var(--paper-dim)]">
        Loading exhibition…
      </div>
    );
  }

  const modalTitle =
    infoModal === "artist"
      ? copy.aboutArtist
      : infoModal === "curator"
        ? copy.aboutCurator
        : infoModal === "donate"
          ? copy.donate
          : infoModal === "links"
            ? copy.links
            : "";

  const modalBody =
    infoModal === "artist"
      ? pickLocalized(settings.aboutArtist, locale)
      : infoModal === "curator"
        ? pickLocalized(settings.aboutCurator, locale)
        : infoModal === "donate"
          ? pickLocalized(settings.donate.text, locale)
          : "";

  return (
    <div
      dir={dir}
      className="relative h-[100dvh] w-full overflow-hidden bg-black"
    >
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
        <div className="pointer-events-auto justify-self-end" />
      </div>

      <div className="pointer-events-none absolute end-3 top-16 z-20 flex flex-col items-end gap-2 sm:end-4 sm:top-20">
        <div className="pointer-events-auto rounded bg-black/40 px-2 py-1 backdrop-blur-sm">
          <LangSwitcher value={locale} onChange={setLocale} />
        </div>
        {(
          [
            ["artist", copy.aboutArtist],
            ["curator", copy.aboutCurator],
            ["donate", copy.donate],
            ["links", copy.links],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="pointer-events-auto btn btn-ghost !border-white/20 !py-1.5 !px-3 !text-[0.65rem] !normal-case !tracking-wide !text-white/85"
            onClick={() => setInfoModal(id)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-end justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost !border-white/20 !py-1.5 !px-3 !text-[0.65rem] !normal-case !tracking-wide !text-white/85"
            onClick={() => openFooterModal("review")}
          >
            {copy.review}
          </button>
          <button
            type="button"
            className="btn btn-ghost !border-white/20 !py-1.5 !px-3 !text-[0.65rem] !normal-case !tracking-wide !text-white/85"
            onClick={() => openFooterModal("contact")}
          >
            {copy.contact}
          </button>
        </div>
        <a
          href={SITE_BY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto text-[0.65rem] tracking-wide text-white/55 underline-offset-2 hover:text-white/85 hover:underline"
        >
          {copy.siteBy} cvgorlov
        </a>
      </div>

      <GalleryScene3D
        key={`three-${catalog.version}-${catalog.updatedAt}`}
        catalog={catalog}
        artworks={artworks}
        locale={locale}
        emptyLabel={copy.emptyRoom}
        previewLite={previewLite}
        presence={presenceScene}
        bookletOwned={bookletOwned}
        bookletRaised={bookletOpen}
        mapPages={settings.entrance.booklet}
        mapPageIndex={bookletPage}
        freezeLookSelection={mediaOpen}
        compositeHeldMapOverMedia={compositeHeldMapOverMedia}
        selectedArtworkId={selected?.id ?? null}
        onSelect={onSelectArtwork}
        onOpenImage={(url) => setImageOverlay(url)}
        onOpenVideo={(url, poster) => setVideoOverlay({ url, poster })}
        onOpenFullscreen={onToggleFullscreen}
        onOpenArtBooklet={onOpenArtBooklet}
        onBookletInteract={onBookletInteract}
      />

      {presenceUi.phase === "queued" ? (
        <BusyQueueOverlay
          position={presenceUi.position}
          onEnterOffline={enterOffline}
        />
      ) : null}

      {infoModal ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto border border-[var(--line)] bg-[#12100e] p-6">
            <h2 className="mb-3 font-[family-name:var(--font-display)] text-2xl font-bold">
              {modalTitle}
            </h2>
            {infoModal === "links" ? (
              <div className="space-y-3 text-[var(--paper-dim)]">
                {settings.email ? (
                  <a
                    href={`mailto:${settings.email}`}
                    className="block hover:text-[var(--amber-bright)]"
                  >
                    {copy.email}: {settings.email}
                  </a>
                ) : null}
                {settings.instagram ? (
                  <a
                    href={settings.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:text-[var(--amber-bright)]"
                  >
                    {copy.instagram}
                  </a>
                ) : null}
                {!settings.email && !settings.instagram ? (
                  <p>No links yet.</p>
                ) : null}
              </div>
            ) : (
              <p className="whitespace-pre-wrap leading-relaxed text-[var(--paper-dim)]">
                {modalBody || "—"}
              </p>
            )}
            {infoModal === "donate" && settings.donate.url ? (
              <a
                href={settings.donate.url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-solid mt-6 inline-flex"
              >
                {copy.donate}
              </a>
            ) : null}
            <button
              type="button"
              className="btn mt-6"
              onClick={() => setInfoModal(null)}
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}

      {footerModal === "review" ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto border border-[var(--line)] bg-[#12100e] p-6">
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-2xl font-bold">
              {copy.review}
            </h2>
            {reviewStatus === "success" ? (
              <p className="mb-4 text-[var(--amber-bright)]">
                {copy.reviewSuccess}
              </p>
            ) : (
              <form className="space-y-3" onSubmit={(e) => void submitReview(e)}>
                <div>
                  <label htmlFor="review-name">{copy.reviewName}</label>
                  <input
                    id="review-name"
                    name="name"
                    required
                    maxLength={120}
                    autoComplete="name"
                    value={reviewName}
                    onChange={(e) => setReviewName(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="review-email">{copy.reviewEmail}</label>
                  <input
                    id="review-email"
                    name="email"
                    type="email"
                    required
                    maxLength={200}
                    autoComplete="email"
                    value={reviewEmail}
                    onChange={(e) => setReviewEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="review-message">{copy.reviewMessage}</label>
                  <textarea
                    id="review-message"
                    name="message"
                    required
                    rows={5}
                    maxLength={5000}
                    value={reviewMessage}
                    onChange={(e) => setReviewMessage(e.target.value)}
                  />
                </div>
                {reviewStatus === "error" ? (
                  <p className="text-sm text-[#e08a7a]">{copy.reviewError}</p>
                ) : null}
                <button
                  type="submit"
                  className="btn btn-solid"
                  disabled={reviewStatus === "sending"}
                >
                  {reviewStatus === "sending"
                    ? copy.reviewSending
                    : copy.reviewSubmit}
                </button>
              </form>
            )}
            <button
              type="button"
              className="btn mt-6"
              onClick={() => setFooterModal(null)}
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}

      {footerModal === "contact" ? (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/55 p-4 sm:items-center">
          <div className="max-h-[70vh] w-full max-w-lg overflow-y-auto border border-[var(--line)] bg-[#12100e] p-6">
            <h2 className="mb-4 font-[family-name:var(--font-display)] text-2xl font-bold">
              {copy.contact}
            </h2>
            <div className="space-y-6 text-[var(--paper-dim)]">
              <section>
                <h3 className="mb-2 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
                  {copy.artist}
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {pickLocalized(settings.aboutArtist, locale) || "—"}
                </p>
              </section>
              <section>
                <h3 className="mb-2 text-sm uppercase tracking-[0.14em] text-[var(--amber)]">
                  {copy.curator}
                </h3>
                <p className="whitespace-pre-wrap leading-relaxed">
                  {pickLocalized(settings.aboutCurator, locale) || "—"}
                </p>
              </section>
              <section className="space-y-2">
                {settings.email ? (
                  <a
                    href={`mailto:${settings.email}`}
                    className="block hover:text-[var(--amber-bright)]"
                  >
                    {copy.email}: {settings.email}
                  </a>
                ) : null}
                {settings.instagram ? (
                  <a
                    href={settings.instagram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:text-[var(--amber-bright)]"
                  >
                    {copy.instagram}
                  </a>
                ) : null}
              </section>
            </div>
            <button
              type="button"
              className="btn mt-6"
              onClick={() => setFooterModal(null)}
            >
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}

      {imageOverlay ? (
        <div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/90 p-8 sm:p-12 md:p-16"
          onClick={() => setImageOverlay(null)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageOverlay}
            alt=""
            className="max-h-[min(78vh,46rem)] max-w-[min(82vw,52rem)] object-contain"
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
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black p-8 sm:p-12 md:p-16">
          <video
            src={videoOverlay.url}
            poster={videoOverlay.poster}
            controls
            playsInline
            autoPlay
            className="max-h-[min(78vh,46rem)] max-w-[min(82vw,52rem)]"
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

      {modelOverlay ? (
        <ModelViewOverlay
          modelUrl={modelOverlay}
          closeLabel={copy.close}
          onClose={() => setModelOverlay(null)}
        />
      ) : null}

      {/* Booklets + art chrome AFTER media so Q/Booklet always stack above View. */}
      {/* !owned art sheet only — owned map never uses BookletOverlay chrome. */}
      {artBookletOpen && artBookletPages.length > 0 ? (
        <BookletOverlay
          pages={artBookletPages}
          pageIndex={artBookletPage}
          locale={locale}
          closeLabel={copy.close}
          anchor="below-art"
          titleLabel={copy.booklet}
          onClose={() => setArtBookletOpen(false)}
          onPage={setArtBookletPage}
        />
      ) : null}

      {selected || showBookletControl ? (
        <div className="pointer-events-none absolute bottom-14 start-1/2 z-[60] flex w-[min(92vw,28rem)] -translate-x-1/2 flex-col items-center gap-2 sm:bottom-8">
          {selected ? (
            <p className="rounded bg-black/55 px-3 py-1.5 text-center font-[family-name:var(--font-display)] text-sm font-semibold tracking-wide text-white/90">
              {pickLocalized(selected.title, locale)}
            </p>
          ) : null}
          {bookletOwned &&
          bookletOpen &&
          !artBookletOpen &&
          settings.entrance.booklet.length > 1 ? (
            <div className="pointer-events-auto flex items-center gap-2 rounded bg-black/45 px-2 py-1 backdrop-blur-sm">
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.7rem]"
                disabled={bookletPage <= 0}
                onClick={() =>
                  setBookletPage((i) =>
                    advanceBookletPageIndex(
                      i,
                      -1,
                      settings.entrance.booklet.length,
                    ),
                  )
                }
              >
                ←
              </button>
              <span className="text-[0.65rem] text-white/60">
                {bookletPage + 1} / {settings.entrance.booklet.length}
              </span>
              <button
                type="button"
                className="btn btn-ghost !py-1 !px-2 !text-[0.7rem]"
                disabled={bookletPage >= settings.entrance.booklet.length - 1}
                onClick={() =>
                  setBookletPage((i) =>
                    advanceBookletPageIndex(
                      i,
                      1,
                      settings.entrance.booklet.length,
                    ),
                  )
                }
              >
                →
              </button>
            </div>
          ) : null}
          <div className="pointer-events-auto flex gap-2">
            {selected ? (
              <button
                type="button"
                className="btn btn-solid !py-2"
                onClick={() => onToggleFullscreen(selected)}
              >
                {copy.view}
              </button>
            ) : null}
            {showBookletControl ? (
              <button
                type="button"
                className={`btn !py-2 ${
                  artBookletOpen || (bookletOwned && bookletOpen)
                    ? "btn-solid"
                    : ""
                }`}
                onClick={onToggleBookletControl}
              >
                {bookletControlLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
