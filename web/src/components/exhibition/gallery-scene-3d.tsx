"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Artwork, Catalog } from "@/lib/catalog-types";
import { normalizeLayout } from "@/lib/catalog-types";
import type { Locale } from "@/lib/i18n";
import { MAX_PIXEL_RATIO } from "@/lib/gallery-three/constants";
import {
  buildLayoutScene,
  layoutHasRooms,
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
  heldBookletLocalPose,
  isWithinPedestalReach,
  resolveBookletKeyAction,
} from "@/lib/gallery-three/booklet-interact";
import { layoutWalkBounds } from "@/lib/gallery-three/painting-pose";
import { ROOM } from "@/lib/room";
import { createGalleryTextureLoader } from "@/lib/gallery-three/texture-load";
import { applySkyToScene, loadNightSky } from "@/lib/gallery-three/sky";
import { roomLength } from "@/lib/room";

type BookletAction = "pickup" | "toggle";

type Props = {
  catalog: Catalog;
  artworks: Artwork[];
  locale: Locale;
  emptyLabel: string;
  previewLite?: boolean;
  bookletOwned?: boolean;
  /** True while the booklet overlay is open (raised in hands). */
  bookletRaised?: boolean;
  onSelect: (art: Artwork | null) => void;
  onOpenImage: (url: string) => void;
  onOpenVideo: (url: string, poster?: string) => void;
  onOpenInfo: () => void;
  onBookletInteract?: (action: BookletAction) => void;
};

export function GalleryScene3D({
  catalog,
  artworks,
  emptyLabel,
  previewLite = false,
  bookletOwned = false,
  bookletRaised = false,
  onSelect,
  onOpenImage,
  onOpenVideo,
  onOpenInfo,
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

  const callbacks = useRef({
    onSelect,
    onOpenImage,
    onOpenVideo,
    onOpenInfo,
    onBookletInteract,
  });
  callbacks.current = {
    onSelect,
    onOpenImage,
    onOpenVideo,
    onOpenInfo,
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

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const loader = createGalleryTextureLoader();
    const texDisposables: THREE.Texture[] = [];

    loadNightSky(loader, (skyTex) => {
      texDisposables.push(skyTex);
      applySkyToScene(scene, skyTex, previewLite);
    });

    const ambient = new THREE.AmbientLight(0xfff2e0, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffe0b0, 0.85);
    dir.position.set(2, 8, 4);
    scene.add(dir);

    let corridorLength = roomLength(artworks.length);
    let walkBounds: ReturnType<typeof layoutWalkBounds> = null;
    const teardowns: Array<() => void> = [];
    let pedestalPick: THREE.Object3D | null = null;
    let bookletMesh: THREE.Object3D | null = null;
    const pedestalWorld = new THREE.Vector3();

    if (useLayout) {
      const built = buildLayoutScene(layout, {});
      scene.add(built.root);
      teardowns.push(built.dispose);
      walkBounds = layoutWalkBounds(layout.rooms);

      const entrance = buildEntranceModule(layout, catalogRef.current, {
        previewLite,
      });
      scene.add(entrance.root);
      teardowns.push(entrance.dispose);
      pedestalPick = entrance.pedestalRoot;
      bookletMesh = entrance.bookletMesh;
      walkBounds = unionWalkBounds(walkBounds, entrance.walkBounds);

      camera.position.set(entrance.spawn.x, 1.6, entrance.spawn.z);
      const yawRad = (entrance.spawn.yawDeg * Math.PI) / 180;
      // Face into the gallery (+local Z from portal).
      camera.lookAt(
        entrance.spawn.x + Math.sin(yawRad) * 2,
        1.6,
        entrance.spawn.z + Math.cos(yawRad) * 2,
      );
    } else {
      const corridor = buildLegacyCorridor(artworks.length);
      corridorLength = corridor.length;
      scene.add(corridor.root);
      teardowns.push(corridor.dispose);

      // Portal at gallery door (z=0); corridor extends +Z, foyer toward −Z.
      const entrance = buildEntranceModule(null, catalogRef.current, {
        previewLite,
        entrancePose: { x: 0, z: -ENTRANCE_SCHEMATIC_DEPTH * 0.5, rotation: 0 },
      });
      scene.add(entrance.root);
      teardowns.push(entrance.dispose);
      pedestalPick = entrance.pedestalRoot;
      bookletMesh = entrance.bookletMesh;
      walkBounds = unionWalkBounds(
        {
          minX: -ROOM.width / 2 + 0.5,
          maxX: ROOM.width / 2 - 0.5,
          minZ: 0.5,
          maxZ: corridorLength - 0.5,
        },
        entrance.walkBounds,
      );
      camera.position.set(entrance.spawn.x, 1.6, entrance.spawn.z);
      camera.lookAt(0, 1.6, Math.min(4, corridorLength / 2));
      if (!previewLite) {
        scene.fog = new THREE.Fog(0x05070f, corridorLength * 0.75, corridorLength * 1.55);
      }
    }

    if (bookletMesh) {
      bookletMesh.visible = !bookletOwnedRef.current;
    }
    if (pedestalPick) {
      pedestalPick.updateWorldMatrix(true, false);
      pedestalPick.getWorldPosition(pedestalWorld);
    }

    // Minecraft-map hold: visible while owned; local Y raises/lowers with Q overlay.
    const heldBookletMat = new THREE.MeshStandardMaterial({
      color: 0xd2b98c,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide,
    });
    const heldBooklet = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.4),
      heldBookletMat,
    );
    heldBooklet.name = "HeldBookletMap";
    heldBooklet.visible = bookletOwnedRef.current;
    heldBooklet.renderOrder = 10;
    scene.add(heldBooklet);
    const heldLocal = new THREE.Vector3();
    const heldEuler = new THREE.Euler(0, 0, 0, "XYZ");
    const heldQuat = new THREE.Quaternion();

    function syncHeldBooklet() {
      const owned = bookletOwnedRef.current;
      heldBooklet.visible = owned;
      if (!owned) return;
      const pose = heldBookletLocalPose(bookletRaisedRef.current);
      // Camera is not parented in the scene graph — compose world pose manually.
      heldLocal
        .set(pose.position.x, pose.position.y, pose.position.z)
        .applyQuaternion(camera.quaternion)
        .add(camera.position);
      heldBooklet.position.copy(heldLocal);
      heldEuler.set(
        (pose.eulerDeg.x * Math.PI) / 180,
        (pose.eulerDeg.y * Math.PI) / 180,
        (pose.eulerDeg.z * Math.PI) / 180,
      );
      heldQuat.setFromEuler(heldEuler);
      heldBooklet.quaternion.copy(camera.quaternion).multiply(heldQuat);
    }
    syncHeldBooklet();

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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      keys.add(e.code);
      if (e.code === "KeyE") callbacks.current.onOpenInfo();
      if (e.code === "KeyQ") {
        const action = resolveBookletKeyAction({
          owned: bookletOwnedRef.current,
          nearPedestal: nearPedestal(),
        });
        if (action) {
          e.preventDefault();
          fireBooklet(action);
        }
      }
      if (e.code === "Escape") {
        document.exitPointerLock?.();
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

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function pick(
      clientX?: number,
      clientY?: number,
    ): THREE.Intersection | null {
      if (
        pointerLocked ||
        clientX === undefined ||
        clientY === undefined
      ) {
        // Pointer lock freezes client coords; aim from view center.
        pointer.set(0, 0);
      } else {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      }
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(pickRoots, true);
      return hits[0] || null;
    }

    function handleSelect(hit: THREE.Intersection, isDouble: boolean) {
      const obj = hit.object;
      let probe: THREE.Object3D | null = obj;
      while (probe) {
        if (probe.userData.isPedestal) {
          fireBooklet(bookletOwnedRef.current ? "toggle" : "pickup");
          return;
        }
        probe = probe.parent;
      }
      const id = (obj.userData.artworkId ||
        obj.parent?.userData.artworkId) as string | undefined;
      if (!id) return;
      const art = artworkById.get(id);
      if (!art) return;

      if (obj.userData.isHeadphones || (art.type === "video" && !isDouble)) {
        if (art.urlVideo) {
          callbacks.current.onOpenVideo(art.urlVideo, art.urlPoster);
          return;
        }
      }

      callbacks.current.onSelect(art);

      if (isDouble && art.type === "image") {
        callbacks.current.onOpenImage(art.urlFull || art.urlWall);
      }
    }

    const onDblClick = (e: MouseEvent) => {
      const hit = pick(e.clientX, e.clientY);
      if (hit) handleSelect(hit, true);
    };

    const onSingleClick = (e: MouseEvent) => {
      if (isTouch) return;
      const hit = pick(e.clientX, e.clientY);
      if (hit) handleSelect(hit, false);
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
      const hit = pick(t.clientX, t.clientY);
      if (!hit) return;
      const id = (hit.object.userData.artworkId ||
        hit.object.parent?.userData.artworkId) as string | undefined;
      const now = Date.now();
      const isDouble = !!id && id === lastTapId && now - lastTap < 350;
      lastTap = now;
      lastTapId = id || null;
      handleSelect(hit, isDouble);
    };

    const onTouchTap = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (joyEl?.contains(t.target as Node)) return;
      const hit = pick(t.clientX, t.clientY);
      if (!hit) return;
      const id = (hit.object.userData.artworkId ||
        hit.object.parent?.userData.artworkId) as string | undefined;
      const now = Date.now();
      const isDouble = !!id && id === lastTapId && now - lastTap < 350;
      lastTap = now;
      lastTapId = id || null;
      handleSelect(hit, isDouble);
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
        camera.position.set(p.x, p.y ?? 1.6, p.z);
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
        camera.position.y = 1.6;
      } else {
        corridorWalkClamp(camera.position, corridorLength);
      }

      if (bookletMesh) {
        bookletMesh.visible = !bookletOwnedRef.current;
      }
      syncHeldBooklet();
      const hint = hintRef.current;
      if (hint) {
        const show = !!pedestalPick && !bookletOwnedRef.current && nearPedestal();
        hint.style.opacity = show ? "1" : "0";
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
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
      scene.remove(heldBooklet);
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
  }, [catalog, artworks, emptyLabel, previewLite]);

  return (
    <div
      className="relative h-full w-full"
      data-gallery-renderer="three"
    >
      <div ref={mountRef} className="h-full w-full" />
      <div
        ref={lookRef}
        className="absolute inset-0 z-10 touch-none md:pointer-events-none md:hidden"
        aria-hidden
      />
      <div
        ref={joyRef}
        className="absolute bottom-8 start-6 z-20 h-28 w-28 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm md:hidden"
        aria-label="Move joystick"
      >
        <div className="absolute start-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/35" />
      </div>
      <p
        ref={hintRef}
        className="pointer-events-none absolute bottom-24 start-1/2 z-20 -translate-x-1/2 rounded bg-black/55 px-3 py-1.5 font-[family-name:var(--font-ui)] text-[0.7rem] text-white/85 opacity-0 transition-opacity duration-200 sm:bottom-16"
      >
        Click pedestal or press Q to take booklet
      </p>
      <p className="pointer-events-none absolute bottom-3 end-3 z-20 hidden font-[family-name:var(--font-ui)] text-[0.65rem] text-white/40 md:block">
        WASD · mouse look · Q raise/lower booklet · click pedestal · E info
      </p>
    </div>
  );
}
