import {
  artworkUploadPathname,
  validateArtworkUpload,
  type ArtworkUploadKind,
  type ArtworkUploadValidation,
} from "./artwork-upload";

export type UploadedArtworkBlob = {
  url: string;
  kind: ArtworkUploadKind;
  pathname: string;
};

/**
 * Upload video or model binary via Vercel Blob client, with local multipart fallback.
 * Images go through /api/admin/process-image instead.
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

  try {
    const { upload } = await import("@vercel/blob/client");
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/admin/upload-token",
      contentType: check.contentType,
    });
    return { url: blob.url, kind: check.kind, pathname };
  } catch {
    /* local fallback */
  }

  const form = new FormData();
  form.append("file", file);
  form.append("kind", check.kind);
  const res = await fetch("/api/admin/upload-token", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Upload failed");
  return {
    url: data.url as string,
    kind: (data.kind as ArtworkUploadKind) || check.kind,
    pathname: (data.pathname as string) || pathname,
  };
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
  if (!res.ok) throw new Error(data.error || "Process failed");
  return { urlWall: data.urlWall, urlFull: data.urlFull };
}
