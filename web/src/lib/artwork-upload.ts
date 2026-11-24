import type { ArtworkType } from "./catalog-types";

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 80 * 1024 * 1024;
export const MODEL_MAX_BYTES = 40 * 1024 * 1024;

/** File picker accept list for unified artwork media upload. */
export const ARTWORK_UPLOAD_ACCEPT =
  "image/jpeg,image/png,image/webp,image/gif,video/mp4,.mp4,.glb,.gltf,model/gltf-binary,model/gltf+json";

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

  if (ext === "mp4" || mime === "video/mp4" || mime.includes("mp4")) {
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
    // Only MP4 is accepted by the gallery pipeline.
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

  if (kind === "video") return "video/mp4";
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

  if (kind === "video") return "mp4";
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
        "Unsupported file. Use an image (JPEG/PNG/WebP/GIF), MP4 video, or 3D model (GLB/GLTF).",
    };
  }

  // Reject non-MP4 videos even if somehow classified.
  if (kind === "video") {
    const ext = extensionOf(file.name);
    const m = mime.toLowerCase();
    if (ext !== "mp4" && !m.includes("mp4")) {
      return { ok: false, error: "Video must be MP4 (H.264)" };
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
