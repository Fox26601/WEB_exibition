import * as THREE from "three";

export function resolveGalleryMediaUrl(url: string): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/") && typeof window !== "undefined") {
    return `${window.location.origin}${url}`;
  }
  return url;
}

function isCrossOriginUrl(resolved: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const u = new URL(resolved, window.location.href);
    return u.origin !== window.location.origin;
  } catch {
    return false;
  }
}

export function createGalleryTextureLoader(): THREE.TextureLoader {
  const loader = new THREE.TextureLoader();
  return loader;
}

/** Prefer fetch + ImageBitmap (reliable on Vercel); fall back to TextureLoader. */
export async function loadColorTexture(
  url: string,
): Promise<THREE.Texture | null> {
  const resolved = resolveGalleryMediaUrl(url);
  if (!resolved) return null;

  try {
    const res = await fetch(resolved, {
      mode: "cors",
      credentials: isCrossOriginUrl(resolved) ? "omit" : "same-origin",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);
    const tex = new THREE.Texture(bitmap);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  } catch {
    return loadColorTextureViaLoader(resolved);
  }
}

function loadColorTextureViaLoader(resolved: string): Promise<THREE.Texture | null> {
  return new Promise((resolve) => {
    const loader = createGalleryTextureLoader();
    if (isCrossOriginUrl(resolved)) {
      loader.setCrossOrigin("anonymous");
    }
    loader.load(
      resolved,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        resolve(tex);
      },
      undefined,
      () => resolve(null),
    );
  });
}

export function applyTextureToMaterial(
  mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial,
  tex: THREE.Texture,
): void {
  mat.map = tex;
  mat.color.set(0xffffff);
  mat.needsUpdate = true;
}

/** Poster JPEGs face +Z; keep title bars readable on inward-facing canvases. */
export function orientGalleryPosterTexture(tex: THREE.Texture): void {
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.x = -1;
  tex.offset.x = 1;
  tex.needsUpdate = true;
}