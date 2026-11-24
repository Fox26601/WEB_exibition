/**
 * Client-side GLB → WebP poster via offscreen Three.js + GLTFLoader.
 * Best-effort: returns null when WebGL / load / encode fails.
 */
export async function generateModelPosterBlob(
  modelUrl: string,
  size = 256,
): Promise<Blob | null> {
  if (typeof window === "undefined" || !modelUrl?.trim()) return null;

  try {
    const THREE = await import("three");
    const { GLTFLoader } = await import(
      "three/examples/jsm/loaders/GLTFLoader.js"
    );

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(size, size, false);
    renderer.setClearColor(0x1a1612, 1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    const light = new THREE.DirectionalLight(0xffffff, 1.2);
    light.position.set(2, 4, 3);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.45));

    const loader = new GLTFLoader();
    const gltf = await new Promise<
      import("three/examples/jsm/loaders/GLTFLoader.js").GLTF
    >((resolve, reject) => {
      loader.load(modelUrl, resolve, undefined, reject);
    });

    const root = gltf.scene;
    scene.add(root);

    const box = new THREE.Box3().setFromObject(root);
    const center = box.getCenter(new THREE.Vector3());
    const extent = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(extent.x, extent.y, extent.z, 0.001);
    root.position.sub(center);
    camera.position.set(maxDim * 1.4, maxDim * 0.9, maxDim * 1.6);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    renderer.render(scene, camera);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/webp", 0.85);
    });

    renderer.dispose();
    scene.clear();
    return blob;
  } catch (err) {
    console.warn("[model-poster] generate failed", err);
    return null;
  }
}

/** Upload a generated poster WebP via process-image (sharp resize path). */
export async function uploadPosterBlob(blob: Blob): Promise<string | null> {
  try {
    const file = new File([blob], "poster.webp", { type: "image/webp" });
    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/admin/process-image", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn("[model-poster] upload failed", data);
      return null;
    }
    return (data.urlWall as string) || (data.urlFull as string) || null;
  } catch (err) {
    console.warn("[model-poster] upload error", err);
    return null;
  }
}
