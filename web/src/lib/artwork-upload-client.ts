import {
  artworkUploadPathname,
  validateArtworkUpload,
  type ArtworkUploadKind,
  type ArtworkUploadValidation,
} from "./artwork-upload";
import { generateModelPosterBlob, uploadPosterBlob } from "./model-poster";
import { generateVideoPosterBlob } from "./video-poster";
import { formatAdminApiError } from "./admin-api";

export type UploadedArtworkBlob = {
  url: string;
  kind: ArtworkUploadKind;
  pathname: string;
  /** Generated poster URL when available (models / videos). */
  urlPoster?: string;
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

  const urlPoster = await generatePosterForUpload(check.kind, file, uploaded.url);
  if (urlPoster) uploaded.urlPoster = urlPoster;
  return uploaded;
}

async function generatePosterForUpload(
  kind: ArtworkUploadKind,
  file: File,
  mediaUrl: string,
): Promise<string | null> {
  try {
    if (kind === "model") {
      const posterBlob = await generateModelPosterBlob(mediaUrl);
      if (!posterBlob) return null;
      return uploadPosterBlob(posterBlob);
    }
    if (kind === "video") {
      const posterBlob = await generateVideoPosterBlob(file);
      if (!posterBlob) return null;
      return uploadPosterBlob(posterBlob);
    }
  } catch (err) {
    console.warn("[artwork-upload] poster generation skipped", err);
  }
  return null;
}

export async function processArtworkImage(file: File): Promise<{
  urlWall: string;
  urlFull: string;
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
  return { urlWall: data.urlWall, urlFull: data.urlFull };
}
