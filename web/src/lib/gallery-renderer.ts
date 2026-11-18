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
 * Pick visitor exhibition 3D backend. Defaults to Three.js.
 * Unity WebGL loads only when `?renderer=unity` or `NEXT_PUBLIC_GALLERY_RENDERER=unity`.
 */
export function resolveGalleryRenderer(
  _unityBuildPresent = false,
  search = "",
): GalleryRendererMode {
  const fromQuery = galleryRendererFromSearch(search);
  if (fromQuery) return fromQuery;
  const fromEnv = galleryRendererFromEnv();
  if (fromEnv) return fromEnv;
  return "three";
}