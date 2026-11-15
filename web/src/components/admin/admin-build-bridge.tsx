"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  Artwork,
  ArtworkPlacement,
  Catalog,
  FrameId,
  GalleryLayout,
} from "@/lib/catalog-types";
import { FRAME_IDS } from "@/lib/catalog-types";
import { pickLocalized } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

const ADMIN_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "";

export type AdminDragKind = "painting" | "sculpture";

export type AdminBridgeMessage =
  | { type: "gallery-admin-init"; catalog: Catalog; layout: GalleryLayout }
  | {
      type: "gallery-admin-begin-drag";
      artworkId: string;
      kind: AdminDragKind;
      frameId: FrameId;
    }
  | { type: "gallery-admin-end-drag"; artworkId: string; commit: boolean }
  | { type: "gallery-admin-remove"; artworkId: string }
  | {
      type: "gallery-admin-set-frame";
      artworkId: string;
      frameId: FrameId;
    }
  | { type: "gallery-admin-rotate"; artworkId: string; deltaYaw: number }
  | { type: "gallery-admin-ready" }
  | { type: "gallery-admin-placements"; placements: ArtworkPlacement[] };

type Props = {
  catalog: Catalog;
  layout: GalleryLayout;
  locale: Locale;
  token: string;
  iframeKey: number;
  onLayoutChange: (layout: GalleryLayout) => void;
};

export function ArtBuildPalette({
  artworks,
  locale,
  placements,
  paletteFrame,
  onPaletteFrameChange,
  onBeginDrag,
  onRemovePlacement,
  onSetFrame,
  disabled,
}: {
  artworks: Artwork[];
  locale: Locale;
  placements: ArtworkPlacement[];
  paletteFrame: FrameId;
  onPaletteFrameChange: (f: FrameId) => void;
  onBeginDrag: (art: Artwork) => void;
  onRemovePlacement: (artworkId: string) => void;
  onSetFrame: (artworkId: string, frameId: FrameId) => void;
  disabled?: boolean;
}) {
  const placed = useMemo(
    () => new Set(placements.map((p) => p.artworkId)),
    [placements],
  );

  return (
    <aside className="flex h-full min-h-0 flex-col border border-[var(--line)] bg-[#1a1612]">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
          2 · Place in 3D
        </h3>
        <p className="mt-1 text-[0.7rem] text-[var(--paper-dim)]">
          Drag a work into the scene. Paintings snap to walls; sculptures to the
          floor.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[0.65rem] text-[var(--paper-dim)]">Frame</span>
          {FRAME_IDS.filter((id) => id !== "none").map((id) => (
            <button
              key={id}
              type="button"
              className={`btn !py-0.5 !px-1.5 !text-[0.6rem] ${
                paletteFrame === id ? "btn-solid" : "btn-ghost"
              }`}
              onClick={() => onPaletteFrameChange(id)}
              disabled={disabled}
            >
              {id}
            </button>
          ))}
        </div>
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {artworks.map((art, i) => {
          const placement = placements.find((p) => p.artworkId === art.id);
          const isPlaced = placed.has(art.id);
          return (
            <li
              key={art.id}
              className={`border p-2 ${
                isPlaced
                  ? "border-[var(--amber)]/50 bg-[#221c16]"
                  : "border-[var(--line)] bg-[#161310]"
              }`}
            >
              <PaletteItem
                art={art}
                index={i + 1}
                locale={locale}
                disabled={disabled}
                onBeginDrag={() => onBeginDrag(art)}
              />
              {isPlaced ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {placement?.kind === "painting" ? (
                    <select
                      className="!py-0.5 !text-[0.65rem]"
                      value={placement.frameId}
                      onChange={(e) =>
                        onSetFrame(art.id, e.target.value as FrameId)
                      }
                      disabled={disabled}
                    >
                      {FRAME_IDS.filter((f) => f !== "none").map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                    </select>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-danger !py-0.5 !px-1.5 !text-[0.6rem]"
                    disabled={disabled}
                    onClick={() => onRemovePlacement(art.id)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {artworks.length === 0 ? (
        <p className="p-3 text-sm text-[var(--paper-dim)]">
          Publish artworks first, then place them in the 3D view.
        </p>
      ) : null}
    </aside>
  );
}

function PaletteItem({
  art,
  index,
  locale,
  disabled,
  onBeginDrag,
}: {
  art: Artwork;
  index: number;
  locale: Locale;
  disabled?: boolean;
  onBeginDrag: () => void;
}) {
  return (
    <div
      className="flex gap-2"
      style={{ cursor: disabled ? "not-allowed" : "grab" }}
      onPointerDown={(e: ReactPointerEvent) => {
        if (disabled) return;
        e.preventDefault();
        onBeginDrag();
      }}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center bg-[#0e0c0a] text-[0.65rem]">
        {index}
      </span>
      <div className="h-12 w-12 shrink-0 overflow-hidden bg-[#0e0c0a]">
        {art.type === "model" ? (
          <div className="flex h-full items-center justify-center text-[0.65rem] text-[var(--paper-dim)]">
            GLB
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art.urlWall || art.urlPoster || ""}
            alt=""
            className="h-full w-full object-cover pointer-events-none"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs">
          {pickLocalized(art.title, locale) || "(untitled)"}
        </p>
        <p className="text-[0.65rem] text-[var(--paper-dim)]">
          {art.type === "model" ? "sculpture" : "painting"}
        </p>
      </div>
    </div>
  );
}

export function AdminBuildBridge({
  catalog,
  layout,
  locale,
  token,
  iframeKey,
  onLayoutChange,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [unityReady, setUnityReady] = useState(false);
  const [paletteFrame, setPaletteFrame] = useState<FrameId>("wood");
  const dragArtRef = useRef<Artwork | null>(null);

  const published = useMemo(
    () =>
      [...catalog.artworks]
        .filter((a) => a.published)
        .sort((a, b) => a.sort - b.sort),
    [catalog.artworks],
  );

  const iframeSrc = useMemo(() => {
    const qs = new URLSearchParams({
      catalog: "draft",
      lang: locale,
      mode: "admin-build",
    });
    if (token) qs.set("token", token);
    return `/exhibition?${qs.toString()}`;
  }, [locale, token]);

  const postToUnity = useCallback((msg: AdminBridgeMessage) => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage(msg, ADMIN_ORIGIN);
    try {
      const unity = (
        win as Window & {
          unityInstance?: {
            SendMessage: (a: string, b: string, c: string) => void;
          };
        }
      ).unityInstance;
      if (msg.type === "gallery-admin-init") {
        unity?.SendMessage(
          "WebAdminBridge",
          "OnJsAdminMessage",
          JSON.stringify(msg),
        );
      }
    } catch {
      /* iframe not ready */
    }
  }, []);

  const pushInit = useCallback(() => {
    postToUnity({
      type: "gallery-admin-init",
      layout,
    } as AdminBridgeMessage);
  }, [layout, postToUnity]);

  useEffect(() => {
    setUnityReady(false);
  }, [iframeKey, iframeSrc]);

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.origin !== ADMIN_ORIGIN) return;
      const data = ev.data as AdminBridgeMessage | undefined;
      if (!data || typeof data !== "object") return;
      if (data.type === "gallery-admin-ready") {
        setUnityReady(true);
        pushInit();
        return;
      }
      if (data.type === "gallery-admin-placements") {
        onLayoutChange({
          ...layout,
          placements: data.placements,
        });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [layout, onLayoutChange, pushInit]);

  useEffect(() => {
    if (unityReady) pushInit();
  }, [catalog, layout, unityReady, pushInit]);

  function kindForArt(art: Artwork): AdminDragKind {
    return art.type === "model" ? "sculpture" : "painting";
  }

  function beginDrag(art: Artwork) {
    dragArtRef.current = art;
    postToUnity({
      type: "gallery-admin-begin-drag",
      artworkId: art.id,
      kind: kindForArt(art),
      frameId:
        art.type === "model"
          ? "none"
          : art.frameId && art.frameId !== "none"
            ? art.frameId
            : paletteFrame,
    });
  }

  function endDrag(commit: boolean) {
    const art = dragArtRef.current;
    if (!art) return;
    postToUnity({
      type: "gallery-admin-end-drag",
      artworkId: art.id,
      commit,
    });
    dragArtRef.current = null;
  }

  function removePlacement(artworkId: string) {
    postToUnity({ type: "gallery-admin-remove", artworkId });
    onLayoutChange({
      ...layout,
      placements: layout.placements.filter((p) => p.artworkId !== artworkId),
    });
  }

  function setFrame(artworkId: string, frameId: FrameId) {
    postToUnity({ type: "gallery-admin-set-frame", artworkId, frameId });
    onLayoutChange({
      ...layout,
      placements: layout.placements.map((p) =>
        p.artworkId === artworkId ? { ...p, frameId } : p,
      ),
    });
  }

  return (
    <div
      className="grid min-h-[min(80vh,900px)] grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]"
      onPointerUp={() => endDrag(true)}
      onPointerLeave={() => {
        if (dragArtRef.current) endDrag(false);
      }}
    >
      <ArtBuildPalette
        artworks={published}
        locale={locale}
        placements={layout.placements}
        paletteFrame={paletteFrame}
        onPaletteFrameChange={setPaletteFrame}
        onBeginDrag={beginDrag}
        onRemovePlacement={removePlacement}
        onSetFrame={setFrame}
        disabled={!unityReady}
      />
      <div className="relative min-h-[480px] border border-[var(--line)] bg-black">
        <div className="absolute inset-x-0 top-0 z-10 border-b border-[var(--line)] bg-[#1a1612]/90 px-3 py-1.5 text-xs text-[var(--paper-dim)]">
          Unity build mode
          {!unityReady ? " · waiting for scene…" : " · drag from palette"}
        </div>
        <iframe
          ref={iframeRef}
          key={`admin-build-${iframeKey}-${locale}-${token}`}
          title="Admin 3D placement"
          src={iframeSrc}
          className="h-[min(80vh,900px)] w-full"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}