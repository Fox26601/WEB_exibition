export type GalleryRendererMode = "unity" | "three";

const ENV_RENDERER = process.env.NEXT_PUBLIC_GALLERY_RENDERER;

/** Server-safe: env only (no query string). */
export function galleryRendererFromEnv(): GalleryRendererMode | null {
  if (ENV_RENDERER === "three") return "three";
  if (ENV_RENDERER === "unity") return "unity";
  return null;
}

export function galleryRendererFromSearch(search: string): GalleryRendererMode | null {
  const r = new URLSearchParams(search).get("renderer");
  if (r === "three") return "three";
  if (r === "unity") return "unity";
  return null;
}

/**
 * Pick exhibition 3D backend. `?renderer=three` and env `NEXT_PUBLIC_GALLERY_RENDERER=three`
 * force Three even when Unity wasm is present.
 */
export function resolveGalleryRenderer(
  unityBuildPresent: boolean,
  search = "",
): GalleryRendererMode {
  const fromQuery = galleryRendererFromSearch(search);
  if (fromQuery) return fromQuery;
  const fromEnv = galleryRendererFromEnv();
  if (fromEnv) return fromEnv;
  return unityBuildPresent ? "unity" : "three";
}