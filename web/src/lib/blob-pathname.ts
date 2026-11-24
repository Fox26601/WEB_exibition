/**
 * Resolve a stored media URL to a blob-store pathname for deleteBlob.
 * Supports local-media query URLs, /local-blob/ paths, and Vercel Blob URLs.
 */
export function blobPathnameFromUrl(url: string | undefined | null): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Skip public static samples — never delete from disk via blob store.
  if (trimmed.startsWith("/samples/") || trimmed.startsWith("/samples%2F")) {
    return null;
  }

  try {
    if (trimmed.startsWith("/api/local-media")) {
      const q = trimmed.includes("?")
        ? trimmed.slice(trimmed.indexOf("?") + 1)
        : "";
      const params = new URLSearchParams(q);
      const path = params.get("path");
      return path && !path.includes("..") ? path : null;
    }

    if (trimmed.startsWith("/local-blob/")) {
      const path = decodeURIComponent(trimmed.slice("/local-blob/".length));
      return path && !path.includes("..") ? path : null;
    }

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      const u = new URL(trimmed);
      if (u.pathname.includes("/api/local-media")) {
        const path = u.searchParams.get("path");
        return path && !path.includes("..") ? path : null;
      }
      // Vercel Blob: pathname is the last path segments after the store host.
      const parts = u.pathname.replace(/^\/+/, "").split("/");
      // Typical: /<storeId>/uploads/... or /uploads/...
      const uploadsIdx = parts.findIndex(
        (p) => p === "uploads" || p.startsWith("catalog-"),
      );
      if (uploadsIdx >= 0) {
        return parts.slice(uploadsIdx).join("/");
      }
      if (parts.length >= 1) {
        return parts[parts.length - 1] || null;
      }
    }

    // Bare pathname key (e.g. uploads/model/uuid.glb)
    if (
      !trimmed.startsWith("/") &&
      (trimmed.startsWith("uploads/") || trimmed.startsWith("catalog-"))
    ) {
      return trimmed;
    }
  } catch {
    return null;
  }
  return null;
}

/** Collect unique blob pathnames for an artwork's media fields. */
export function artworkMediaPathnames(art: {
  urlWall?: string;
  urlFull?: string;
  urlVideo?: string;
  urlPoster?: string;
  modelUrl?: string;
}): string[] {
  const keys = [
    art.urlWall,
    art.urlFull,
    art.urlVideo,
    art.urlPoster,
    art.modelUrl,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of keys) {
    const path = blobPathnameFromUrl(url);
    if (path && !seen.has(path)) {
      seen.add(path);
      out.push(path);
    }
  }
  return out;
}
