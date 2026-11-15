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
import { mapPointerThroughExhibitionIframe } from "@/lib/unity-pointer-map";

const ADMIN_ORIGIN =
  typeof window !== "undefined" ? window.location.origin : "";

export type AdminDragKind = "painting" | "sculpture";

export type AdminPointerPayload = {
  screenX: number;
  screenY: number;
  normU: number;
  normV: number;
  overCanvas: boolean;
};

export type AdminBridgeMessage =
  | { type: "gallery-admin-init"; catalog: Catalog; layout: GalleryLayout }
  | ({
      type: "gallery-admin-begin-drag";
      artworkId: string;
      kind: AdminDragKind;
      frameId: FrameId;
    } & AdminPointerPayload)
  | ({ type: "gallery-admin-drag-move" } & AdminPointerPayload)
  | { type: "gallery-admin-end-drag"; artworkId: string; commit: boolean }
  | { type: "gallery-admin-remove"; artworkId: string }
  | {
      type: "gallery-admin-set-frame";
      artworkId: string;
      frameId: FrameId;
    }
  | { type: "gallery-admin-rotate"; artworkId: string; deltaYaw: number }
  | { type: "gallery-admin-ready" }
  | { type: "gallery-admin-placements"; placements: ArtworkPlacement[] }
  | { type: "gallery-admin-drag-rejected"; reason: string };

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
  onBeginDrag: (art: Artwork, e: ReactPointerEvent) => void;
  onRemovePlacement: (artworkId: string) => void;
  onSetFrame: (artworkId: string, frameId: FrameId) => void;
  disabled?: boolean;
}) {
  const placed = useMemo(
    () => new Set(placements.map((p) => p.artworkId)),
    [placements],
  );

  return (
    <aside className="flex h-full min-h-0 flex-col border border-[var(--line)] bg-[#1a1612] lg:w-[260px]">
      <div className="border-b border-[var(--line)] px-3 py-2">
        <h3 className="text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
          2 · Place in 3D
        </h3>
        <p className="mt-1 text-[0.7rem] text-[var(--paper-dim)]">
          Картину — на стену; скульптуру — на пол. Зелёный призрак = можно
          отпустить.
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
                onBeginDrag={(e) => onBeginDrag(art, e)}
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
  onBeginDrag: (e: ReactPointerEvent) => void;
}) {
  return (
    <div
      className="flex gap-2 touch-none select-none"
      style={{ cursor: disabled ? "not-allowed" : "grab" }}
      onPointerDown={(e: ReactPointerEvent) => {
        if (disabled) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        onBeginDrag(e);
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

type DragOverlayState = {
  art: Artwork;
  x: number;
  y: number;
};

function DragOverlay({ overlay }: { overlay: DragOverlayState | null }) {
  if (!overlay) return null;
  const { art, x, y } = overlay;
  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: x + 12,
        top: y + 12,
        width: 72,
        height: 72,
      }}
      aria-hidden
    >
      <div className="h-full w-full overflow-hidden border-2 border-[var(--amber-bright)] bg-[#0e0c0a] shadow-lg">
        {art.type === "model" ? (
          <div className="flex h-full items-center justify-center text-[0.65rem] text-[var(--paper-dim)]">
            GLB
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={art.urlWall || art.urlPoster || ""}
            alt=""
            className="h-full w-full object-cover opacity-90"
          />
        )}
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
  const dragActiveRef = useRef(false);
  const [dragOverlay, setDragOverlay] = useState<DragOverlayState | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
  }, []);

  const pushInit = useCallback(() => {
    postToUnity({
      type: "gallery-admin-init",
      catalog,
      layout,
    });
  }, [catalog, layout, postToUnity]);

  const mapPointer = useCallback(
    (clientX: number, clientY: number): AdminPointerPayload | null => {
      const mapped = mapPointerThroughExhibitionIframe(
        clientX,
        clientY,
        iframeRef.current,
      );
      if (!mapped) return null;
      return {
        screenX: mapped.screenX,
        screenY: mapped.screenY,
        normU: mapped.normU,
        normV: mapped.normV,
        overCanvas: mapped.overCanvas,
      };
    },
    [],
  );

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
        return;
      }
      if (data.type === "gallery-admin-drag-rejected") {
        const reason = (data as { reason?: string }).reason;
        setToast(
          reason === "no_snap"
            ? "Не удалось повесить на стену — подведите ближе к стене."
            : "Размещение отменено.",
        );
        window.setTimeout(() => setToast(null), 3200);
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

  const sendDragMove = useCallback(
    (clientX: number, clientY: number) => {
      const pointer = mapPointer(clientX, clientY);
      if (!pointer) return;
      postToUnity({
        type: "gallery-admin-drag-move",
        ...pointer,
      });
    },
    [mapPointer, postToUnity],
  );

  const endDrag = useCallback(
    (clientX: number, clientY: number) => {
      const art = dragArtRef.current;
      if (!art || !dragActiveRef.current) return;
      const pointer = mapPointer(clientX, clientY);
      const commit = pointer?.overCanvas === true;
      postToUnity({
        type: "gallery-admin-end-drag",
        artworkId: art.id,
        commit,
      });
      dragArtRef.current = null;
      dragActiveRef.current = false;
      setDragOverlay(null);
    },
    [mapPointer, postToUnity],
  );

  const beginDrag = useCallback(
    (art: Artwork, e: ReactPointerEvent) => {
      dragArtRef.current = art;
      dragActiveRef.current = true;
      setDragOverlay({ art, x: e.clientX, y: e.clientY });

      const pointer =
        mapPointer(e.clientX, e.clientY) ?? {
          screenX: 0,
          screenY: 0,
          normU: 0,
          normV: 0,
          overCanvas: false,
        };

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
        ...pointer,
      });

      const onMove = (ev: PointerEvent) => {
        setDragOverlay({ art, x: ev.clientX, y: ev.clientY });
        sendDragMove(ev.clientX, ev.clientY);
      };
      const onUp = (ev: PointerEvent) => {
        endDrag(ev.clientX, ev.clientY);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [endDrag, mapPointer, paletteFrame, postToUnity, sendDragMove],
  );

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
    <div className="grid min-h-[calc(100dvh-11rem)] grid-cols-1 gap-3 lg:grid-cols-[auto_1fr]">
      <DragOverlay overlay={dragOverlay} />
      {toast ? (
        <div
          className="pointer-events-none fixed bottom-6 left-1/2 z-[10000] -translate-x-1/2 border border-[var(--amber)]/60 bg-[#1a1612] px-4 py-2 text-sm text-[var(--paper)] shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}
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
      <div className="relative min-h-[calc(100dvh-14rem)] border border-[var(--line)] bg-black">
        <div className="absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[#1a1612]/95 px-3 py-2 text-xs text-[var(--paper-dim)]">
          <h3 className="m-0 text-[0.65rem] font-normal uppercase tracking-[0.14em] text-[var(--paper)]">
            Unity · расстановка
            {!unityReady ? " · загрузка…" : " · готово"}
          </h3>
          <p className="m-0 max-w-md text-[0.7rem] leading-snug">
            Перетащите работу из списка — превью у курсора, отпустите над
            сценой. Клик по размещённой работе — сдвинуть.
          </p>
        </div>
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-[var(--line)] bg-[#141210]/92 px-3 py-2.5 text-[0.72rem] leading-relaxed text-[var(--paper)] shadow-[0_-8px_24px_rgba(0,0,0,0.45)]"
          aria-label="Управление камерой"
        >
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>
              <strong className="text-[var(--amber-bright)]">ЛКМ</strong> —
              поворот вида
            </span>
            <span>
              <strong className="text-[var(--amber-bright)]">ПКМ</strong> —
              сдвиг плана
            </span>
            <span>
              <strong className="text-[var(--amber-bright)]">Колёсико</strong> —
              масштаб
            </span>
            <span className="text-[var(--paper-dim)]">
              Space+ЛКМ — сдвиг · средняя кнопка — сдвиг
            </span>
          </div>
        </div>
        <iframe
          ref={iframeRef}
          key={`admin-build-${iframeKey}-${locale}-${token}`}
          title="Admin 3D placement"
          src={iframeSrc}
          className="h-[calc(100dvh-14rem)] min-h-[420px] w-full"
          allow="autoplay; fullscreen"
        />
      </div>
    </div>
  );
}