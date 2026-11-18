"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import type { Artwork, Catalog } from "@/lib/catalog-types";
import { normalizeSettings } from "@/lib/catalog-types";
import { UI, pickLocalized } from "@/lib/i18n";
import { useGalleryLocale } from "@/lib/use-gallery-locale";
import { LangSwitcher } from "@/components/lang-switcher";
import { GalleryScene3D } from "./gallery-scene-3d";
import { BookletOverlay } from "./booklet-overlay";

type InfoModal = "artist" | "curator" | "donate" | "links" | null;
type FooterModal = "review" | "contact" | null;
type ReviewStatus = "idle" | "sending" | "success" | "error";

const SITE_BY_URL = "https://webgalerey.app";

export function ExhibitionApp() {
  const { locale, setLocale, dir } = useGalleryLocale();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Artwork | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [imageOverlay, setImageOverlay] = useState<string | null>(null);
  const [videoOverlay, setVideoOverlay] = useState<{
    url: string;
    poster?: string;
  } | null>(null);
  const [previewLite, setPreviewLite] = useState(false);
  const [infoModal, setInfoModal] = useState<InfoModal>(null);
  const [bookletOpen, setBookletOpen] = useState(false);
  const [bookletPage, setBookletPage] = useState(0);
  const [bookletOwned, setBookletOwned] = useState(false);
  const [footerModal, setFooterModal] = useState<FooterModal>(null);
  const [reviewName, setReviewName] = useState("");
  const [reviewEmail, setReviewEmail] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("idle");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get("catalog") === "draft" ? "draft" : "live";
    const tok = params.get("token");
    const mode = params.get("mode");
    setPreviewLite(mode === "preview-lite");

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
          setCatalog({ ...data, settings: normalizeSettings(data.settings) });
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
      if (e.key === "Escape") {
        setImageOverlay(null);
        setVideoOverlay(null);
        setInfoOpen(false);
        setInfoModal(null);
        setFooterModal(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  const artworks = useMemo(() => {
    if (!catalog) return [];
    return catalog.artworks
      .filter((a) => a.published)
      .sort((a, b) => a.sort - b.sort);
  }, [catalog]);

  const copy = UI[locale];
  const settings = catalog ? normalizeSettings(catalog.settings) : null;

  function postToggleBooklet() {
    if (!bookletOwned) {
      setBookletOwned(true);
    }
    setBookletOpen((open) => !open);
  }

  function onPedestalPickup() {
    setBookletOwned((owned) => {
      if (!owned) setBookletPage(0);
      setBookletOpen((open) => (owned ? !open : true));
      return true;
    });
  }

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

      {bookletOwned ? (
        <div className="pointer-events-none absolute bottom-14 start-1/2 z-20 -translate-x-1/2">
          <button
            type="button"
            className="pointer-events-auto btn btn-solid !py-2 !px-5"
            onClick={postToggleBooklet}
          >
            {copy.map}
          </button>
        </div>
      ) : null}

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
        onSelect={setSelected}
        onOpenImage={(url) => setImageOverlay(url)}
        onOpenVideo={(url, poster) => setVideoOverlay({ url, poster })}
        onOpenInfo={() => setInfoOpen(true)}
        onPedestalPickup={onPedestalPickup}
      />

      {bookletOpen && bookletOwned ? (
        <BookletOverlay
          pages={settings.entrance.booklet}
          pageIndex={bookletPage}
          locale={locale}
          closeLabel={copy.close}
          onClose={() => setBookletOpen(false)}
          onPage={setBookletPage}
        />
      ) : null}

      {selected && !infoOpen && !imageOverlay && !videoOverlay ? (
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

      {infoOpen && selected ? (
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
