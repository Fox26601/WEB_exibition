export type GalleryRendererMode = "three";

/**
 * Visitor exhibition always uses Three.js.
 * Legacy `renderer` query / env overrides are ignored.
 */
export function resolveGalleryRenderer(
  _unusedBuildPresent = false,
  _search = "",
): GalleryRendererMode {
  return "three";
}
