import {
  artworkUploadPathname,
  validateArtworkUpload,
  type ArtworkUploadKind,
  type ArtworkUploadValidation,
} from "./artwork-upload";
import { generateModelPosterBlob, uploadPosterBlob } from "./model-poster";
import { generateVideoPosterWithSize } from "./video-poster";
import { adminFetch, formatAdminApiError } from "./admin-api";

export type UploadedArtworkBlob = {
  url: string;
  kind: ArtworkUploadKind;
  pathname: string;
  /** Generated poster URL when available (models / videos). */
  urlPoster?: string;
  mediaWidth?: number;
  mediaHeight?: number;
};

/**
 * Upload video or model binary via Vercel Blob client, with local multipart fallback.
 * Images go through /api/admin/process-image instead.
 * Models/videos also best-effort generate urlPoster.
 */
export async function uploadArtworkBinary(
  file: File,
  validated?: Extract<ArtworkUploadValidation, { ok: true }>,
): Promise<UploadedArtworkBlob> {
  const check = validated ?? validateArtworkUpload(file);
  if (!check.ok) throw new Error(check.error);
  if (check.kind === "image") {
    throw new Error("Images must use process-image, not binary upload");
  }

  const pathname = artworkUploadPathname(check.kind, check.ext);

  let uploaded: UploadedArtworkBlob | null = null;

  try {
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/admin/upload-token",
      contentType: check.contentType,
    });
    uploaded = { url: blob.url, kind: check.kind, pathname };
  } catch {
    /* local fallback */
  }

  if (!uploaded) {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", check.kind);
    const res = await fetch("/api/admin/upload-token", {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(formatAdminApiError(data, "Upload failed"));
    }
    uploaded = {
      url: data.url as string,
      kind: (data.kind as ArtworkUploadKind) || check.kind,
      pathname: (data.pathname as string) || pathname,
    };
  }

  const extras = await generatePosterForUpload(check.kind, file, uploaded.url);
  if (extras.urlPoster) uploaded.urlPoster = extras.urlPoster;
  if (extras.mediaWidth) uploaded.mediaWidth = extras.mediaWidth;
  if (extras.mediaHeight) uploaded.mediaHeight = extras.mediaHeight;
  return uploaded;
}

async function generatePosterForUpload(
  kind: ArtworkUploadKind,
  file: File,
  mediaUrl: string,
): Promise<{
  urlPoster?: string;
  mediaWidth?: number;
  mediaHeight?: number;
}> {
  try {
    if (kind === "model") {
      const posterBlob = await generateModelPosterBlob(mediaUrl);
      if (!posterBlob) return {};
      const urlPoster = await uploadPosterBlob(posterBlob);
      return urlPoster ? { urlPoster } : {};
    }
    if (kind === "video") {
      const poster = await generateVideoPosterWithSize(file);
      if (!poster) return {};
      const urlPoster = await uploadPosterBlob(poster.blob);
      return {
        ...(urlPoster ? { urlPoster } : {}),
        mediaWidth: poster.mediaWidth,
        mediaHeight: poster.mediaHeight,
      };
    }
  } catch (err) {
    console.warn("[artwork-upload] poster generation skipped", err);
  }
  return {};
}

export async function processArtworkImage(file: File): Promise<{
  urlWall: string;
  urlFull: string;
  mediaWidth?: number;
  mediaHeight?: number;
}> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/admin/process-image", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) {
    console.warn("[process-image] failed", data);
    throw new Error(formatAdminApiError(data, "Process failed"));
  }
  return {
    urlWall: data.urlWall,
    urlFull: data.urlFull,
    ...(typeof data.mediaWidth === "number" ? { mediaWidth: data.mediaWidth } : {}),
    ...(typeof data.mediaHeight === "number"
      ? { mediaHeight: data.mediaHeight }
      : {}),
  };
}

/** Record URLs written during an edit session (process-image / upload-token). */
export function trackSessionUploadUrls(
  bag: Set<string>,
  ...urls: Array<string | undefined | null>
): void {
  for (const url of urls) {
    if (typeof url === "string" && url.trim()) bag.add(url.trim());
  }
}

/**
 * Best-effort delete of blobs uploaded in an editor session that was cancelled
 * without Save. Failures are ignored so Cancel never blocks the UI.
 */
export async function deleteOrphanUploadUrls(
  urls: Iterable<string>,
): Promise<void> {
  const list = [...new Set([...urls].map((u) => u.trim()).filter(Boolean))];
  if (!list.length) return;
  try {
    await adminFetch("/api/admin/delete-blobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: list }),
    });
  } catch {
    /* best-effort */
  }
}
