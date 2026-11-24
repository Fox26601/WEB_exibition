import type { ArtworkType } from "./catalog-types";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const MODEL_MAX_BYTES = 40 * 1024 * 1024;

/** Browser-playable video extensions (iPhone MOV/HEVC + common web containers). */
export const VIDEO_UPLOAD_EXTENSIONS = ["mp4", "mov", "m4v", "webm"] as const;

/** File picker accept list for unified artwork media upload. */
export const ARTWORK_UPLOAD_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  ".mp4",
  ".mov",
  ".m4v",
  ".webm",
  ".glb",
  ".gltf",
  "model/gltf-binary",
  "model/gltf+json",
].join(",");

/** Content types allowed for Vercel Blob video tokens. */
export const VIDEO_UPLOAD_CONTENT_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "application/octet-stream",
] as const;

export type ArtworkUploadKind = ArtworkType;

export type DetectedArtworkUpload = {
  kind: ArtworkUploadKind;
  ext: string;
  contentType: string;
  maxBytes: number;
};

export type ArtworkUploadValidation =
  | ({ ok: true } & DetectedArtworkUpload)
  | { ok: false; error: string };

function basename(name: string): string {
  const slash = Math.max(name.lastIndexOf("/"), name.lastIndexOf("\\"));
  return slash >= 0 ? name.slice(slash + 1) : name;
}

function extensionOf(name: string): string {
  const base = basename(name).toLowerCase();
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1) : "";
}

function isAllowedVideoExt(ext: string): boolean {
  return (VIDEO_UPLOAD_EXTENSIONS as readonly string[]).includes(ext);
}

function isAllowedVideoMime(mime: string): boolean {
  return (
    mime === "video/mp4" ||
    mime === "video/quicktime" ||
    mime === "video/webm" ||
    mime === "video/x-m4v" ||
    mime.includes("mp4") ||
    mime.includes("quicktime") ||
    mime.includes("webm")
  );
}

/**
 * Detect artwork media kind from MIME type and/or file extension.
 * Prefers extension when MIME is empty or generic (octet-stream).
 */
export function detectArtworkUploadKind(
  fileName: string,
  mimeType = "",
): ArtworkUploadKind | null {
  const mime = (mimeType || "").toLowerCase().trim();
  const ext = extensionOf(fileName);

  const mimeIsGeneric =
    !mime ||
    mime === "application/octet-stream" ||
    mime === "binary/octet-stream";

  if (
    ext === "glb" ||
    ext === "gltf" ||
    mime === "model/gltf-binary" ||
    mime === "model/gltf+json" ||
    mime.includes("gltf")
  ) {
    return "model";
  }

  if (isAllowedVideoExt(ext) || (!mimeIsGeneric && isAllowedVideoMime(mime))) {
    return "video";
  }

  if (
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "png" ||
    ext === "webp" ||
    ext === "gif" ||
    (!mimeIsGeneric && mime.startsWith("image/"))
  ) {
    return "image";
  }

  if (!mimeIsGeneric && mime.startsWith("video/")) {
    // Reject containers we cannot serve for gallery playback.
    return null;
  }

  return null;
}

export function maxBytesForKind(kind: ArtworkUploadKind): number {
  if (kind === "video") return VIDEO_MAX_BYTES;
  if (kind === "model") return MODEL_MAX_BYTES;
  return IMAGE_MAX_BYTES;
}

export function contentTypeForKind(
  kind: ArtworkUploadKind,
  fileName: string,
  mimeType = "",
): string {
  const mime = (mimeType || "").toLowerCase().trim();
  const ext = extensionOf(fileName);

  if (kind === "video") {
    if (mime.startsWith("video/")) return mime;
    if (ext === "mov") return "video/quicktime";
    if (ext === "webm") return "video/webm";
    if (ext === "m4v") return "video/x-m4v";
    return "video/mp4";
  }
  if (kind === "model") {
    if (ext === "gltf" || mime.includes("gltf+json")) return "model/gltf+json";
    return "model/gltf-binary";
  }
  if (mime.startsWith("image/")) return mime;
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

export function extForKind(
  kind: ArtworkUploadKind,
  fileName: string,
  mimeType = "",
): string {
  const mime = (mimeType || "").toLowerCase().trim();
  const ext = extensionOf(fileName);

  if (kind === "video") {
    if (isAllowedVideoExt(ext)) return ext;
    if (mime.includes("quicktime")) return "mov";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("m4v")) return "m4v";
    return "mp4";
  }
  if (kind === "model") {
    if (ext === "gltf" || mime.includes("gltf+json")) return "gltf";
    return "glb";
  }
  if (ext === "png" || mime.includes("png")) return "png";
  if (ext === "webp" || mime.includes("webp")) return "webp";
  if (ext === "gif" || mime.includes("gif")) return "gif";
  if (ext === "jpg" || ext === "jpeg" || mime.includes("jpeg")) return "jpg";
  return "jpg";
}

export function describeUploadLimit(kind: ArtworkUploadKind): string {
  if (kind === "video") return "80MB";
  if (kind === "model") return "40MB";
  return "8MB";
}

/**
 * Validate a candidate upload: kind detection, allowed formats, size.
 */
export function validateArtworkUpload(file: {
  name: string;
  type?: string;
  size: number;
}): ArtworkUploadValidation {
  const mime = file.type || "";
  const kind = detectArtworkUploadKind(file.name, mime);
  if (!kind) {
    return {
      ok: false,
      error:
        "Unsupported file. Use an image (JPEG/PNG/WebP/GIF), video (MP4/MOV/M4V/WebM), or 3D model (GLB/GLTF).",
    };
  }

  if (kind === "video") {
    const ext = extensionOf(file.name);
    const m = mime.toLowerCase();
    if (!isAllowedVideoExt(ext) && !isAllowedVideoMime(m)) {
      return {
        ok: false,
        error:
          "Video must be MP4, MOV, M4V, or WebM (H.264 / HEVC / VP9 as the browser allows).",
      };
    }
  }

  const maxBytes = maxBytesForKind(kind);
  if (file.size > maxBytes) {
    return {
      ok: false,
      error: `File exceeds ${describeUploadLimit(kind)} limit`,
    };
  }

  return {
    ok: true,
    kind,
    ext: extForKind(kind, file.name, mime),
    contentType: contentTypeForKind(kind, file.name, mime),
    maxBytes,
  };
}

/** Blob pathname under uploads/{kind}/{uuid}.{ext}. */
export function artworkUploadPathname(
  kind: ArtworkUploadKind,
  ext: string,
  id: string = crypto.randomUUID(),
): string {
  return `uploads/${kind}/${id}.${ext}`;
}
