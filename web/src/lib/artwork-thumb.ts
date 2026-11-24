import type { Artwork, ArtworkType } from "./catalog-types";

/** Best thumbnail URL for list/palette icons; empty when none. */
export function artworkThumbUrl(art: Pick<
  Artwork,
  "type" | "urlWall" | "urlFull" | "urlPoster" | "modelUrl"
>): string {
  const poster = (art.urlPoster || "").trim();
  const wall = (art.urlWall || "").trim();
  const full = (art.urlFull || "").trim();
  if (art.type === "model") return poster;
  if (art.type === "video") return poster || wall || full;
  return wall || full || poster;
}

/** Compact type chip when no poster/image URL exists. */
export function artworkTypeChip(type: ArtworkType): string {
  if (type === "model") return "3D";
  if (type === "video") return "VID";
  return "IMG";
}
