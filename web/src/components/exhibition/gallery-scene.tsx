"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { Artwork } from "@/lib/catalog-types";
import type { Locale } from "@/lib/i18n";
import { ROOM, roomLength, slotPose } from "@/lib/room";

type Props = {
  artworks: Artwork[];
  locale: Locale;
  emptyLabel: string;
  onSelect: (art: Artwork | null) => void;
  onOpenImage: (url: string) => void;
  onOpenVideo: (url: string, poster?: string) => void;
  onOpenInfo: () => void;
};

export function GalleryScene({
  artworks,
  emptyLabel,
  onSelect,
  onOpenImage,
  onOpenVideo,
  onOpenInfo,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const joyRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);
  const artworksRef = useRef(artworks);
  artworksRef.current = artworks;

  const callbacks = useRef({ onSelect, onOpenImage, onOpenVideo, onOpenInfo });
  callbacks.current = { onSelect, onOpenImage, onOpenVideo, onOpenInfo };

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const length = roomLength(artworks.length);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1612);
    scene.fog = new THREE.Fog(0x1a1612, length * 0.6, length * 1.4);

    const camera = new THREE.PerspectiveCamera(
      70,
      mount.clientWidth / Math.max(mount.clientHeight, 1),
      0.1,
      100,
    );
    camera.position.set(0, 1.6, 1.5);
    camera.lookAt(0, 1.6, length / 2);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xfff2e0, 0.55);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffe0b0, 0.85);
    dir.position.set(2, 6, length / 2);
    scene.add(dir);

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x2a241e,
      roughness: 0.9,
    });
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x3a322a,
      roughness: 0.95,
    });
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x221e1a,
      roughness: 1,
    });

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, length),
      floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, length / 2);
    scene.add(floor);

    const ceiling = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, length),
      ceilMat,
    );
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, ROOM.height, length / 2);
    scene.add(ceiling);

    const leftWall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, ROOM.height),
      wallMat,
    );
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-ROOM.width / 2, ROOM.height / 2, length / 2);
    scene.add(leftWall);

    const rightWall = new THREE.Mesh(
      new THREE.PlaneGeometry(length, ROOM.height),
      wallMat,
    );
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(ROOM.width / 2, ROOM.height / 2, length / 2);
    scene.add(rightWall);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ROOM.height),
      wallMat,
    );
    backWall.position.set(0, ROOM.height / 2, length);
    scene.add(backWall);

    const frontWall = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM.width, ROOM.height),
      wallMat,
    );
    frontWall.rotation.y = Math.PI;
    frontWall.position.set(0, ROOM.height / 2, 0);
    scene.add(frontWall);

    const loader = new THREE.TextureLoader();
    const frames: THREE.Object3D[] = [];
    const artworkById = new Map<string, Artwork>();

    artworks.forEach((art, index) => {
      artworkById.set(art.id, art);
      const pose = slotPose(index);
      const group = new THREE.Group();
      group.position.set(pose.x, 1.55, pose.z);
      group.rotation.y = pose.wall === "left" ? Math.PI / 2 : -Math.PI / 2;
      group.userData.artworkId = art.id;

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 1.4, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x1a140f, roughness: 0.7 }),
      );
      group.add(frame);

      const canvasMat = new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.6,
      });
      const canvas = new THREE.Mesh(
        new THREE.PlaneGeometry(1.2, 1.2),
        canvasMat,
      );
      canvas.position.z = 0.05;
      canvas.userData.artworkId = art.id;
      canvas.userData.isCanvas = true;
      group.add(canvas);

      const texUrl = art.urlWall || art.urlPoster;
      if (texUrl) {
        loader.load(texUrl, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          canvasMat.map = tex;
          canvasMat.color.set(0xffffff);
          canvasMat.needsUpdate = true;
        });
      }

      if (art.type === "video") {
        const hp = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 16, 16),
          new THREE.MeshStandardMaterial({
            color: 0xc4893a,
            metalness: 0.4,
            roughness: 0.4,
          }),
        );
        hp.position.set(0.7, -0.55, 0.1);
        hp.userData.artworkId = art.id;
        hp.userData.isHeadphones = true;
        group.add(hp);
      }

      scene.add(group);
      frames.push(group);
    });

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
      spr.position.set(0, 1.8, length / 2);
      scene.add(spr);
    }

    // Controls state
    const keys = new Set<string>();
    const velocity = new THREE.Vector3();
    const euler = new THREE.Euler(0, 0, 0, "YXZ");
    let pointerLocked = false;
    const isTouch =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || navigator.maxTouchPoints > 0);

    const joy = { x: 0, y: 0 };
    let lookDragging = false;
    let lastLookX = 0;
    let lastLookY = 0;
    let lastTap = 0;
    let lastTapId: string | null = null;

    const onKeyDown = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (e.code === "KeyE") callbacks.current.onOpenInfo();
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

    function pick(clientX: number, clientY: number): THREE.Intersection | null {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(frames, true);
      return hits[0] || null;
    }

    function handleSelect(hit: THREE.Intersection, isDouble: boolean) {
      const obj = hit.object;
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

    // Mobile joystick
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
      lastLookX = e.changedTouches[0].clientX;
      lastLookY = e.changedTouches[0].clientY;
    };
    const onLookMove = (e: TouchEvent) => {
      if (!lookDragging) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - lastLookX;
      const dy = t.clientY - lastLookY;
      lastLookX = t.clientX;
      lastLookY = t.clientY;
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * 0.005;
      euler.x -= dy * 0.005;
      euler.x = Math.max(-1.2, Math.min(1.2, euler.x));
      camera.quaternion.setFromEuler(euler);
    };
    const onLookEnd = () => {
      lookDragging = false;
    };

    const onTouchTap = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      // ignore if on joystick zones
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
      if (!mount) return;
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const clock = new THREE.Clock();
    const forward = new THREE.Vector3();
    const right = new THREE.Vector3();

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
      if (velocity.lengthSq() > 0) velocity.normalize().multiplyScalar(speed * dt);

      camera.position.add(velocity);
      camera.position.x = THREE.MathUtils.clamp(
        camera.position.x,
        -ROOM.width / 2 + 0.5,
        ROOM.width / 2 - 0.5,
      );
      camera.position.z = THREE.MathUtils.clamp(
        camera.position.z,
        0.5,
        length - 0.5,
      );
      camera.position.y = 1.6;

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
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [artworks, emptyLabel]);

  return (
    <div className="relative h-full w-full">
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
      <p className="pointer-events-none absolute bottom-3 end-3 z-20 hidden font-[family-name:var(--font-ui)] text-[0.65rem] text-white/40 md:block">
        WASD · mouse look · double-click image · E info
      </p>
    </div>
  );
}
