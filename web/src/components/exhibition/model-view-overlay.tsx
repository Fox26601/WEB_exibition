"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

type Props = {
  modelUrl: string;
  closeLabel: string;
  onClose: () => void;
};

/**
 * Fullscreen orbit viewer for sculpture GLBs (E / View for type === "model").
 * Same chrome role as the painting image overlay — booklet sheets stack above.
 */
export function ModelViewOverlay({ modelUrl, closeLabel, onClose }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0908);

    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(mount.clientWidth, 1) / Math.max(mount.clientHeight, 1),
      0.05,
      40,
    );
    camera.position.set(1.6, 1.1, 1.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xf0e6d8, 0x2a241c, 1.1);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2e0, 1.35);
    key.position.set(2.2, 4, 1.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb8c4d8, 0.45);
    fill.position.set(-2, 1.2, -1.5);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 0.6;
    controls.maxDistance = 8;
    controls.target.set(0, 0.45, 0);
    controls.update();

    let modelRoot: THREE.Object3D | null = null;
    let cancelled = false;
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      (gltf) => {
        if (cancelled) return;
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        model.scale.setScalar(1.35 / maxDim);
        box.setFromObject(model);
        const center = new THREE.Vector3();
        box.getCenter(center);
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= box.min.y;
        scene.add(model);
        modelRoot = model;
        box.setFromObject(model);
        const mid = new THREE.Vector3();
        box.getCenter(mid);
        controls.target.copy(mid);
        camera.position.set(mid.x + 1.5, mid.y + 0.55, mid.z + 1.7);
        controls.update();
      },
      undefined,
      () => {
        /* keep empty stage */
      },
    );

    const onResize = () => {
      const w = Math.max(mount.clientWidth, 1);
      const h = Math.max(mount.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    let raf = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      controls.dispose();
      if (modelRoot) scene.remove(modelRoot);
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [modelUrl]);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/92 p-8 sm:p-12 md:p-16"
      role="dialog"
      aria-label="Sculpture view"
    >
      <div
        ref={mountRef}
        className="relative h-[min(78vh,46rem)] w-[min(86vw,52rem)] overflow-hidden"
      />
      <button
        type="button"
        className="btn absolute end-4 top-4 z-10"
        onClick={onClose}
      >
        {closeLabel}
      </button>
      <p className="pointer-events-none absolute bottom-4 start-1/2 z-10 -translate-x-1/2 text-[0.65rem] tracking-wide text-white/45">
        Drag to orbit · scroll to zoom
      </p>
    </div>
  );
}
