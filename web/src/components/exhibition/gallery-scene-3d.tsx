"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Artwork, BookletPage, Catalog } from "@/lib/catalog-types";
import { normalizeLayout } from "@/lib/catalog-types";
import { pickLocalized, type Locale } from "@/lib/i18n";
import { MAX_PIXEL_RATIO } from "@/lib/gallery-three/constants";
import {
  buildLayoutScene,
  layoutHasRooms,
  makeFloorMaterial,
  makeWallMaterial,
} from "@/lib/gallery-three/layout-builder";
import {
  addCorridorArtworks,
  addPlacementsToScene,
} from "@/lib/gallery-three/placement-meshes";
import {
  buildLegacyCorridor,
  corridorWalkClamp,
} from "@/lib/gallery-three/legacy-corridor";
import {
  buildEntranceModule,
  ENTRANCE_SCHEMATIC_DEPTH,
  unionWalkBounds,
} from "@/lib/gallery-three/entrance-builder";
import {
  HELD_MAP_PLANE,
  HELD_MAP_SCALE_LOWERED,
  HELD_MAP_SCALE_RAISED,
  heldBookletLocalPose,
  isWithinPedestalReach,
  lerpHeldBookletPose,
  paintHeldMapPage,
  resolveBookletKeyAction,
  resolveExhibitionQAction,
} from "@/lib/gallery-three/booklet-interact";
import {
  ARTWORK_INTERACT_DISTANCE,
  ARTWORK_LOOK_DISTANCE,
  firstArtworkHit,
  resolveIntersection,
} from "@/lib/gallery-three/artwork-interact";
import { layoutWalkBounds } from "@/lib/gallery-three/painting-pose";
import {
  sampleEyeY,
  type ClimbBand,
  type WalkAabb,
} from "@/lib/gallery-three/walk-surface";
import { ROOM } from "@/lib/room";
import { createGalleryTextureLoader } from "@/lib/gallery-three/texture-load";
import { applySkyToScene, loadNightSky } from "@/lib/gallery-three/sky";
import { roomLength } from "@/lib/room";
import { PRESENCE_POSE_HZ } from "@/lib/presence/constants";
import type { PresenceSceneApi } from "@/lib/presence/use-presence-session";
import {
  clearRemoteAvatars,
  syncRemoteAvatarMap,
  tickRemoteAvatars,
  yawFromCamera,
  type RemoteAvatarHandle,
} from "@/lib/presence/remote-avatars";

type BookletAction = "pickup" | "toggle";

type Props = {
  catalog: Catalog;
  artworks: Artwork[];
  locale: Locale;
  emptyLabel: string;
  previewLite?: boolean;
  /** Photon presence bridge — publish local pose + draw remote capsules. */
  presence?: PresenceSceneApi;
  bookletOwned?: boolean;
  /** True while the held map is raised in first-person hands. */
  bookletRaised?: boolean;
  /** Entrance booklet pages painted onto the FP held map. */
  mapPages?: BookletPage[];
  mapPageIndex?: number;
  /** When true, look-at must not clear / swap the current artwork selection. */
  freezeLookSelection?: boolean;
  /**
   * View/fullscreen HTML covers the gallery — raise this canvas above it and
   * draw only the held map (transparent clear) so the FP item stays visible.
   */
  compositeHeldMapOverMedia?: boolean;
  /** Selected painting id (chrome / View); Q fallback when look-at is frozen. */
  selectedArtworkId?: string | null;
  onSelect: (art: Artwork | null) => void;
  onOpenImage: (url: string) => void;
  onOpenVideo: (url: string, poster?: string) => void;
  /** E / View / mobile tap: toggle fullscreen art modal (image or video). */
  onOpenFullscreen: (art: Artwork | null) => void;
  /** Q while focused on art and map not owned: toggle compact art bottom sheet. */
  onOpenArtBooklet: (artworkId: string) => void;
  onBookletInteract?: (action: BookletAction) => void;
};

export function GalleryScene3D({
  catalog,
  artworks,
  locale,
  emptyLabel,
  previewLite = false,
  presence,
  bookletOwned = false,
  bookletRaised = false,
  mapPages = [],
  mapPageIndex = 0,
  freezeLookSelection = false,
  compositeHeldMapOverMedia = false,
  selectedArtworkId = null,
  onSelect,
  onOpenImage,
  onOpenVideo,
  onOpenFullscreen,
  onOpenArtBooklet,
  onBookletInteract,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);
  const artworksRef = useRef(artworks);
  artworksRef.current = artworks;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const bookletOwnedRef = useRef(bookletOwned);
  bookletOwnedRef.current = bookletOwned;
  const bookletRaisedRef = useRef(bookletRaised);
  bookletRaisedRef.current = bookletRaised;
  const mapPagesRef = useRef(mapPages);
  mapPagesRef.current = mapPages;
  const mapPageIndexRef = useRef(mapPageIndex);
  mapPageIndexRef.current = mapPageIndex;
  const localeRef = useRef(locale);
  localeRef.current = locale;
  const compositeHeldMapRef = useRef(compositeHeldMapOverMedia);
  compositeHeldMapRef.current = compositeHeldMapOverMedia;
  const freezeLookRef = useRef(freezeLookSelection);
  freezeLookRef.current = freezeLookSelection;
  const selectedArtworkIdRef = useRef(selectedArtworkId);
  selectedArtworkIdRef.current = selectedArtworkId;
  const presenceRef = useRef(presence);
  presenceRef.current = presence;

  const callbacks = useRef({
    onSelect,
    onOpenImage,
    onOpenVideo,
    onOpenFullscreen,
    onOpenArtBooklet,
    onBookletInteract,
  });
  callbacks.current = {
    onSelect,
    onOpenImage,
    onOpenVideo,
    onOpenFullscreen,
    onOpenArtBooklet,
    onBookletInteract,
  };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const layout = normalizeLayout(catalog.layout);
    const useLayout = layoutHasRooms(catalog.layout);
    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      70,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      120,
    );

    // alpha: true so we can clear transparent and stack the held map over View.
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setClearColor(0x000000, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.domElement.style.background = "transparent";
    mount.appendChild(renderer.domElement);

    const loader = createGalleryTextureLoader();
    const texDisposables: THREE.Texture[] = [];
    let galleryBackground: THREE.Color | THREE.Texture | null = null;
    let galleryFog: THREE.Fog | THREE.FogExp2 | null = null;

    loadNightSky(loader, (skyTex) => {
      texDisposables.push(skyTex);
      applySkyToScene(scene, skyTex, previewLite);
      galleryBackground = scene.background as THREE.Texture;
      galleryFog = scene.fog;
    });

    const ambient = new THREE.AmbientLight(0xfff2e0, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffe0b0, 0.85);
    dir.position.set(2, 8, 4);
    scene.add(dir);

    let corridorLength = roomLength(artworks.length);
    let walkBounds: ReturnType<typeof layoutWalkBounds> = null;
    let galleryBounds: WalkAabb | null = null;
    let climbBands: ClimbBand[] = [];
    const teardowns: Array<() => void> = [];
    let pedestalPick: THREE.Object3D | null = null;
    let bookletMesh: THREE.Object3D | null = null;
    const pedestalWorld = new THREE.Vector3();

    const eyeAt = (x: number, z: number) =>
      sampleEyeY(x, z, { climbBands, galleryBounds });

    if (useLayout) {
      // One floor/wall material for foyer + every layout room (same shade/UV rules).
      const floorMat = makeFloorMaterial();
      const wallMat = makeWallMaterial();
      const built = buildLayoutScene(layout, {}, { floorMat, wallMat });
      scene.add(built.root);
      teardowns.push(built.dispose);
      galleryBounds = layoutWalkBounds(layout.rooms);
      walkBounds = galleryBounds;

      const entrance = buildEntranceModule(layout, catalogRef.current, {
        previewLite,
        floorMat,
        wallMat,
      });
      scene.add(entrance.root);
      teardowns.push(entrance.dispose);
      teardowns.push(() => {
        floorMat.dispose();
        wallMat.dispose();
      });
      pedestalPick = entrance.pedestalRoot;
      bookletMesh = entrance.bookletMesh;
      climbBands = entrance.climbBands;
      walkBounds = unionWalkBounds(walkBounds, entrance.walkBounds);

      const spawnEye = eyeAt(entrance.spawn.x, entrance.spawn.z);
      camera.position.set(entrance.spawn.x, spawnEye, entrance.spawn.z);
      const yawRad = (entrance.spawn.yawDeg * Math.PI) / 180;
      // Face into the gallery (+local Z from portal).
      camera.lookAt(
        entrance.spawn.x + Math.sin(yawRad) * 2,
        spawnEye,
        entrance.spawn.z + Math.cos(yawRad) * 2,
      );
    } else {
      const corridor = buildLegacyCorridor(artworks.length);
      corridorLength = corridor.length;
      scene.add(corridor.root);
      teardowns.push(corridor.dispose);

      // Portal at gallery door (z=0); corridor extends +Z, foyer toward −Z.
      // Corridor already uses makeFloorMaterial; foyer gets its own matching instance.
      const entrance = buildEntranceModule(null, catalogRef.current, {
        previewLite,
        entrancePose: { x: 0, z: -ENTRANCE_SCHEMATIC_DEPTH * 0.5, rotation: 0 },
      });
      scene.add(entrance.root);
      teardowns.push(entrance.dispose);
      pedestalPick = entrance.pedestalRoot;
      bookletMesh = entrance.bookletMesh;
      climbBands = entrance.climbBands;
      galleryBounds = {
        minX: -ROOM.width / 2 + 0.5,
        maxX: ROOM.width / 2 - 0.5,
        minZ: 0.5,
        maxZ: corridorLength - 0.5,
      };
      walkBounds = unionWalkBounds(galleryBounds, entrance.walkBounds);
      const spawnEye = eyeAt(entrance.spawn.x, entrance.spawn.z);
      camera.position.set(entrance.spawn.x, spawnEye, entrance.spawn.z);
      camera.lookAt(0, spawnEye, Math.min(4, corridorLength / 2));
      if (!previewLite) {
        scene.fog = new THREE.Fog(0x05070f, corridorLength * 0.75, corridorLength * 1.55);
        galleryFog = scene.fog;
      }
    }

    // Entrance spawn / scene remount: clear look selection + art booklet (not refetch itself).
    callbacks.current.onSelect(null);

    if (bookletMesh) {
      bookletMesh.visible = !bookletOwnedRef.current;
    }
    if (pedestalPick) {
      pedestalPick.updateWorldMatrix(true, false);
      pedestalPick.getWorldPosition(pedestalWorld);
    }

    // Minecraft-map hold: camera child (local −Z = in front). Owned map is this
    // mesh only — art/no-booklet UI still uses BookletOverlay bottom sheet elsewhere.
    // Camera must be in the scene graph for children to render.
    scene.add(camera);
    const heldMapCanvas = document.createElement("canvas");
    heldMapCanvas.width = 1024;
    heldMapCanvas.height = 768;
    const heldMapTex = new THREE.CanvasTexture(heldMapCanvas);
    heldMapTex.colorSpace = THREE.SRGBColorSpace;
    texDisposables.push(heldMapTex);
    const heldBookletMat = new THREE.MeshBasicMaterial({
      map: heldMapTex,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      transparent: false,
    });
    const heldBooklet = new THREE.Mesh(
      new THREE.PlaneGeometry(HELD_MAP_PLANE.width, HELD_MAP_PLANE.height),
      heldBookletMat,
    );
    heldBooklet.name = "HeldBookletMap";
    heldBooklet.visible = bookletOwnedRef.current;
    heldBooklet.renderOrder = 1000;
    heldBooklet.frustumCulled = false;
    // Layer 1: when View covers the gallery we render only this layer.
    heldBooklet.layers.set(1);
    camera.layers.enable(1);
    camera.add(heldBooklet);
    let raiseAmt = bookletRaisedRef.current ? 1 : 0;
    let lastMapPaintKey = "";

    function paintHeldMapIfNeeded() {
      const pages = mapPagesRef.current;
      const n = pages.length;
      const idx = Math.max(0, Math.min(mapPageIndexRef.current, Math.max(0, n - 1)));
      const page = pages[idx];
      const title = pickLocalized(page?.title, localeRef.current) || "Map";
      const body = pickLocalized(page?.body, localeRef.current) || "";
      const pageLabel = n > 1 ? `${idx + 1} / ${n}` : "";
      const key = `${localeRef.current}|${idx}|${title}|${body}|${pageLabel}`;
      if (key === lastMapPaintKey) return;
      lastMapPaintKey = key;
      paintHeldMapPage(heldMapCanvas, { title, body, pageLabel });
      heldMapTex.needsUpdate = true;
    }

    function syncHeldBooklet(dt = 0.016) {
      const owned = bookletOwnedRef.current;
      heldBooklet.visible = owned;
      if (!owned) {
        raiseAmt = 0;
        return;
      }
      paintHeldMapIfNeeded();
      const target = bookletRaisedRef.current ? 1 : 0;
      raiseAmt = THREE.MathUtils.damp(raiseAmt, target, 14, dt);
      const pose = lerpHeldBookletPose(raiseAmt);
      const scale =
        HELD_MAP_SCALE_LOWERED +
        (HELD_MAP_SCALE_RAISED - HELD_MAP_SCALE_LOWERED) * raiseAmt;
      heldBooklet.scale.set(scale, scale, 1);
      // pose.z = distance in front; Three.js camera forward is −Z.
      heldBooklet.position.set(
        pose.position.x,
        pose.position.y,
        -pose.position.z,
      );
      heldBooklet.rotation.set(
        (pose.eulerDeg.x * Math.PI) / 180,
        (pose.eulerDeg.y * Math.PI) / 180,
        (pose.eulerDeg.z * Math.PI) / 180,
      );
    }
    syncHeldBooklet(0);

    const artworkById = new Map(artworks.map((a) => [a.id, a]));
    let pickRoots: THREE.Object3D[] = [];
    if (useLayout) {
      const placed = addPlacementsToScene(scene, catalogRef.current, artworks, loader);
      pickRoots = placed.pickRoots;
      teardowns.push(placed.dispose);
    } else {
      const placed = addCorridorArtworks(scene, artworks, loader);
      pickRoots = placed.pickRoots;
      teardowns.push(placed.dispose);
    }
    if (pedestalPick) pickRoots.push(pedestalPick);

    if (artworks.length === 0) {
      const canvas = document.createElement("canvas");
      canvas.width = 512;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#1a1612";
      ctx.fillRect(0, 0, 512, 128);
      ctx.fillStyle = "#c9bba6";
      ctx.font = "28px serif";
      ctx.textAlign = "center";
      ctx.fillText(emptyLabel, 256, 72);
      const sprTex = new THREE.CanvasTexture(canvas);
      const spr = new THREE.Mesh(
        new THREE.PlaneGeometry(4, 1),
        new THREE.MeshBasicMaterial({ map: sprTex, transparent: true }),
      );
      const z =
        useLayout && walkBounds
          ? (walkBounds.minZ + walkBounds.maxZ) * 0.5
          : corridorLength / 2;
      spr.position.set(0, 1.8, z);
      scene.add(spr);
      texDisposables.push(sprTex);
    }

    const keys = new Set<string>();
    const velocity = new THREE.Vector3();
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    euler.setFromQuaternion(camera.quaternion);
    let pointerLocked = false;
    const isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    const joy = { x: 0, y: 0 };
    let lookDragging = false;
    let lookMoved = false;
    let lastLookX = 0;
    let lastLookY = 0;
    let lookStartX = 0;
    let lookStartY = 0;
    let lastTap = 0;
    let lastTapId: string | null = null;

    function nearPedestal(): boolean {
      if (!pedestalPick) return false;
      return isWithinPedestalReach(
        camera.position.x,
        camera.position.z,
        pedestalWorld.x,
        pedestalWorld.z,
      );
    }

    function fireBooklet(action: BookletAction) {
      callbacks.current.onBookletInteract?.(action);
    }

    const raycaster = new THREE.Raycaster();
    raycaster.far = ARTWORK_INTERACT_DISTANCE;
    const pointer = new THREE.Vector2();
    let lookFocusedId: string | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (e.code === "KeyE") {
        e.preventDefault();
        const id = lookFocusedId;
        const art = id ? artworkById.get(id) : undefined;
        callbacks.current.onOpenFullscreen(art ?? null);
      }
      if (e.code === "KeyQ") {
        // freezeLook only pauses look-at swaps — never blocks booklet raise/toggle.
        const q = resolveExhibitionQAction({
          focusedArtworkId: lookFocusedId,
          selectedArtworkId: selectedArtworkIdRef.current,
          owned: bookletOwnedRef.current,
          nearPedestal: nearPedestal(),
        });
        if (!q) return;
        e.preventDefault();
        if (q.kind === "art-booklet") {
          callbacks.current.onOpenArtBooklet(q.artworkId);
          return;
        }
        fireBooklet(q.action);
      }
      if (e.code === "Escape") {
        document.exitPointerLock?.();
        lookFocusedId = null;
        callbacks.current.onSelect(null);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);

    const onClick = () => {
      if (!isTouch && !pointerLocked) {
        renderer.domElement.requestPointerLock();
      }
    };

    const onPointerLockChange = () => {
      pointerLocked = document.pointerLockElement === renderer.domElement;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!pointerLocked) return;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= e.movementX * 0.002;
      euler.x -= e.movementY * 0.002;
      euler.x = Math.max(-1.2, Math.min(1.2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };

    function setPointerFromEvent(clientX?: number, clientY?: number) {
      if (
        pointerLocked ||
        clientX === undefined ||
        clientY === undefined
      ) {
        // Pointer lock freezes client coords; aim from view center.
        pointer.set(0, 0);
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickHits(
      clientX?: number,
      clientY?: number,
    ): THREE.Intersection[] {
      setPointerFromEvent(clientX, clientY);
      raycaster.far = ARTWORK_INTERACT_DISTANCE;
      raycaster.setFromCamera(pointer, camera);
      return raycaster.intersectObjects(pickRoots, true);
    }

    function handleSelect(hits: THREE.Intersection[], isDouble: boolean) {
      if (hits.length === 0) {
        lookFocusedId = null;
        callbacks.current.onSelect(null);
        return;
      }

      const camPos = camera.position;
      const top = resolveIntersection(hits[0], ARTWORK_INTERACT_DISTANCE, camPos);
      if (top.kind === "pedestal") {
        fireBooklet(bookletOwnedRef.current ? "toggle" : "pickup");
        return;
      }

      const artHit = firstArtworkHit(hits, ARTWORK_INTERACT_DISTANCE, camPos);
      if (artHit.kind !== "artwork" || !artHit.artworkId) {
        lookFocusedId = null;
        callbacks.current.onSelect(null);
        return;
      }

      const art = artworkById.get(artHit.artworkId);
      if (!art) return;

      const hitObj = hits.find((h) => {
        const r = resolveIntersection(h, ARTWORK_INTERACT_DISTANCE, camPos);
        return r.artworkId === art.id;
      })?.object;

      lookFocusedId = art.id;
      callbacks.current.onSelect(art);

      // Mobile tap / double-click / headphones → fullscreen art modal (same as E).
      if (
        isTouch ||
        isDouble ||
        hitObj?.userData.isHeadphones ||
        (art.type === "video" && !isDouble)
      ) {
        callbacks.current.onOpenFullscreen(art);
      }
    }

    function syncLookAtSelection() {
      if (freezeLookRef.current) return;
      raycaster.far = ARTWORK_LOOK_DISTANCE;
      pointer.set(0, 0);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickRoots, true);
      // Pass camera so reach uses full 3D (includes raised hang Y), not XZ-only.
      const artHit = firstArtworkHit(hits, ARTWORK_LOOK_DISTANCE, camera.position);
      const nextId = artHit.kind === "artwork" ? artHit.artworkId : null;
      if (nextId === lookFocusedId) return;
      lookFocusedId = nextId;
      if (!nextId) {
        callbacks.current.onSelect(null);
        return;
      }
      const art = artworkById.get(nextId);
      callbacks.current.onSelect(art ?? null);
    }

    const onDblClick = (e: MouseEvent) => {
      handleSelect(pickHits(e.clientX, e.clientY), true);
    };

    const onSingleClick = (e: MouseEvent) => {
      if (isTouch) return;
      handleSelect(pickHits(e.clientX, e.clientY), false);
    };

    const joyEl = joyRef.current;
    const lookEl = lookRef.current;

    function bindStick(
      el: HTMLElement | null,
      onMove: (nx: number, ny: number) => void,
      onEnd: () => void,
    ) {
      if (!el) return () => undefined;
      const start = (e: TouchEvent) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const move = (ev: TouchEvent) => {
          const p = ev.changedTouches[0];
          const dx = (p.clientX - cx) / (rect.width / 2);
          const dy = (p.clientY - cy) / (rect.height / 2);
          onMove(
            Math.max(-1, Math.min(1, dx)),
            Math.max(-1, Math.min(1, dy)),
          );
        };
        const end = () => {
          onEnd();
          window.removeEventListener("touchmove", move);
          window.removeEventListener("touchend", end);
        };
        window.addEventListener("touchmove", move, { passive: false });
        window.addEventListener("touchend", end);
        move(e);
      };
      el.addEventListener("touchstart", start, { passive: false });
      return () => el.removeEventListener("touchstart", start);
    }

    const unbindJoy = bindStick(
      joyEl,
      (x, y) => {
        joy.x = x;
        joy.y = y;
      },
      () => {
        joy.x = 0;
        joy.y = 0;
      },
    );

    const onLookStart = (e: TouchEvent) => {
      lookDragging = true;
      lookMoved = false;
      lastLookX = e.changedTouches[0].clientX;
      lastLookY = e.changedTouches[0].clientY;
      lookStartX = lastLookX;
      lookStartY = lastLookY;
    };
    const onLookMove = (e: TouchEvent) => {
      if (!lookDragging) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - lastLookX;
      const dy = t.clientY - lastLookY;
      lastLookX = t.clientX;
      lastLookY = t.clientY;
      if (
        Math.hypot(t.clientX - lookStartX, t.clientY - lookStartY) > 12
      ) {
        lookMoved = true;
      }
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * 0.005;
      euler.x -= dy * 0.005;
      euler.x = Math.max(-1.2, Math.min(1.2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };
    const onLookEnd = (e: TouchEvent) => {
      const wasDrag = lookDragging;
      const moved = lookMoved;
      lookDragging = false;
      lookMoved = false;
      if (!wasDrag || moved) return;
      const t = e.changedTouches[0];
      if (!t) return;
      const hits = pickHits(t.clientX, t.clientY);
      const artHit = firstArtworkHit(
        hits,
        ARTWORK_INTERACT_DISTANCE,
        camera.position,
      );
      const id = artHit.artworkId;
      const now = Date.now();
      const isDouble = !!id && id === lastTapId && now - lastTap < 350;
      lastTap = now;
      lastTapId = id || null;
      handleSelect(hits, isDouble);
    };

    const onTouchTap = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (joyEl?.contains(t.target as Node)) return;
      const hits = pickHits(t.clientX, t.clientY);
      const artHit = firstArtworkHit(
        hits,
        ARTWORK_INTERACT_DISTANCE,
        camera.position,
      );
      const id = artHit.artworkId;
      const now = Date.now();
      const isDouble = !!id && id === lastTapId && now - lastTap < 350;
      lastTap = now;
      lastTapId = id || null;
      handleSelect(hits, isDouble);
    };

    lookEl?.addEventListener("touchstart", onLookStart, { passive: true });
    lookEl?.addEventListener("touchmove", onLookMove, { passive: true });
    lookEl?.addEventListener("touchend", onLookEnd);
    renderer.domElement.addEventListener("touchend", onTouchTap);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    renderer.domElement.addEventListener("click", onClick);
    renderer.domElement.addEventListener("click", onSingleClick);
    renderer.domElement.addEventListener("dblclick", onDblClick);
    document.addEventListener("pointerlockchange", onPointerLockChange);
    window.addEventListener("mousemove", onMouseMove);

    const onResize = () => {
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();
    const remoteAvatars = new Map<number, RemoteAvatarHandle>();
    let poseAccum = 0;
    const poseInterval = 1 / PRESENCE_POSE_HZ;

    const qaMode =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("qa") === "1";
    if (qaMode) {
      type Win = Window & {
        __setGalleryCamera?: (p: {
          x: number;
          y: number;
          z: number;
          yawDeg: number;
          pitchDeg?: number;
        }) => void;
        __galleryBookletDebug?: () => {
          owned: boolean;
          raised: boolean;
          near: boolean;
          action: ReturnType<typeof resolveBookletKeyAction>;
          heldLocalY: number;
          pedestal: { x: number; z: number };
          camera: { x: number; z: number };
        };
      };
      (window as Win).__setGalleryCamera = (p) => {
        camera.position.set(
          p.x,
          p.y ?? eyeAt(p.x, p.z),
          p.z,
        );
        euler.set(
          ((p.pitchDeg ?? 0) * Math.PI) / 180,
          (p.yawDeg * Math.PI) / 180,
          0,
          "YXZ",
        );
        camera.quaternion.setFromEuler(euler);
      };
      (window as Win).__galleryBookletDebug = () => {
        const near = nearPedestal();
        const raised = bookletRaisedRef.current;
        return {
          owned: bookletOwnedRef.current,
          raised,
          near,
          action: resolveBookletKeyAction({
            owned: bookletOwnedRef.current,
            nearPedestal: near,
          }),
          heldLocalY: heldBookletLocalPose(raised).position.y,
          pedestal: { x: pedestalWorld.x, z: pedestalWorld.z },
          camera: { x: camera.position.x, z: camera.position.z },
        };
      };
    }

    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const speed = 3.2;

      let mx = 0;
      let mz = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) mz -= 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) mz += 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) mx -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) mx += 1;
      mx += joy.x;
      mz += joy.y;

      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

      velocity.set(0, 0, 0);
      velocity.addScaledVector(forward, -mz);
      velocity.addScaledVector(right, mx);
      if (velocity.lengthSq() > 0) {
        velocity.normalize().multiplyScalar(speed * dt);
      }

      camera.position.add(velocity);
      if (walkBounds) {
        camera.position.x = THREE.MathUtils.clamp(
          camera.position.x,
          walkBounds.minX,
          walkBounds.maxX,
        );
        camera.position.z = THREE.MathUtils.clamp(
          camera.position.z,
          walkBounds.minZ,
          walkBounds.maxZ,
        );
        camera.position.y = eyeAt(camera.position.x, camera.position.z);
      } else {
        corridorWalkClamp(camera.position, corridorLength);
      }

      if (bookletMesh) {
        bookletMesh.visible = !bookletOwnedRef.current;
      }
      syncHeldBooklet(dt);
      syncLookAtSelection();
      const hint = hintRef.current;
      if (hint) {
        const show = !!pedestalPick && !bookletOwnedRef.current && nearPedestal();
        hint.style.opacity = show ? "1" : "0";
      }

      // Presence: publish local camera pose ~10 Hz; lerp remote capsules.
      const presenceApi = presenceRef.current;
      if (presenceApi?.online) {
        poseAccum += dt;
        if (poseAccum >= poseInterval) {
          poseAccum = 0;
          presenceApi.publishPose({
            x: camera.position.x,
            y: camera.position.y,
            z: camera.position.z,
            yaw: yawFromCamera(camera, euler),
          });
        }
        syncRemoteAvatarMap(scene, remoteAvatars, presenceApi.getRemotes());
        tickRemoteAvatars(remoteAvatars, dt);
      } else if (remoteAvatars.size > 0) {
        clearRemoteAvatars(remoteAvatars);
      }

      // Owned + View: transparent canvas above the HTML modal, held map only.
      const composite =
        compositeHeldMapRef.current && bookletOwnedRef.current;
      if (composite) {
        camera.layers.set(1);
        renderer.setClearColor(0x000000, 0);
        scene.background = null;
        scene.fog = null;
      } else {
        camera.layers.set(0);
        camera.layers.enable(1);
        renderer.setClearColor(0x000000, 1);
        scene.background = galleryBackground;
        scene.fog = galleryFog;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      clearRemoteAvatars(remoteAvatars);
      unbindJoy();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      lookEl?.removeEventListener("touchstart", onLookStart);
      lookEl?.removeEventListener("touchmove", onLookMove);
      lookEl?.removeEventListener("touchend", onLookEnd);
      for (const fn of teardowns) fn();
      for (const t of texDisposables) t.dispose();
      heldBooklet.geometry.dispose();
      heldBookletMat.dispose();
      camera.remove(heldBooklet);
      scene.remove(camera);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      if (qaMode) {
        type Win = Window & {
          __setGalleryCamera?: unknown;
          __galleryBookletDebug?: unknown;
        };
        delete (window as Win).__setGalleryCamera;
        delete (window as Win).__galleryBookletDebug;
      }
    };
    // Rebuild only when catalog revision (or lite/empty chrome) changes.
    // Object-identity churn from focus refetch must not wipe walk / camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- catalog/artworks read at effect start; refs cover live reads
  }, [catalog.version, catalog.updatedAt, emptyLabel, previewLite]);

  return (
    <div
      className={
        compositeHeldMapOverMedia
          ? "pointer-events-none absolute inset-0 z-[45] h-full w-full"
          : "absolute inset-0 z-0 h-full w-full"
      }
      data-gallery-renderer="three"
      data-held-map-over-media={compositeHeldMapOverMedia ? "1" : "0"}
    >
      <div ref={mountRef} className="h-full w-full" />
      <div
        ref={lookRef}
        className={`absolute inset-0 z-10 touch-none md:pointer-events-none md:hidden ${
          compositeHeldMapOverMedia ? "hidden" : ""
        }`}
        aria-hidden
      />
      <div
        ref={joyRef}
        className={`absolute bottom-8 start-6 z-20 h-28 w-28 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm md:hidden ${
          compositeHeldMapOverMedia ? "hidden" : ""
        }`}
        aria-label="Move joystick"
      >
        <div className="absolute start-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35" />
      </div>
      <p
        ref={hintRef}
        className={`pointer-events-none absolute bottom-24 start-1/2 z-20 -translate-x-1/2 rounded bg-black/55 px-3 py-1.5 font-[family-name:var(--font-ui)] text-[0.7rem] text-white/85 opacity-0 transition-opacity duration-200 sm:bottom-16 ${
          compositeHeldMapOverMedia ? "hidden" : ""
        }`}
      >
        Click pedestal or press Q to take booklet
      </p>
      <p
        className={`pointer-events-none absolute bottom-3 end-3 z-20 hidden font-[family-name:var(--font-ui)] text-[0.65rem] text-white/40 md:block ${
          compositeHeldMapOverMedia ? "!hidden" : ""
        }`}
      >
        WASD · mouse look · E toggle view · Q map or art sheet · click pedestal
      </p>
    </div>
  );
}
