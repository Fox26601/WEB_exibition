import * as THREE from "three";

export function resolveGalleryMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${url}`;
  }
  return url;
}

export function createGalleryTextureLoader(): THREE.TextureLoader {
  const loader = new THREE.TextureLoader();
  loader.crossOrigin = "anonymous";
  return loader;
}

export function loadColorTexture(
  loader: THREE.TextureLoader,
  url: string,
  onReady: (tex: THREE.Texture) => void,
): void {
  const resolved = resolveGalleryMediaUrl(url);
  if (!resolved) return;
  loader.load(
    resolved,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      onReady(tex);
    },
    undefined,
    () => {
      /* keep solid fallback color */
    },
  );
}