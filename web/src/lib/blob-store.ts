import {
  put,
  list,
  del,
  get,
  head,
  BlobPreconditionFailedError,
  BlobNotFoundError,
} from "@vercel/blob";
import { createHash } from "crypto";
import { mkdir, readFile, writeFile, unlink, readdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

/** On Vercel without Blob token, cwd is read-only — use /tmp. Shared with local-media. */
export function getLocalDataDir(): string {
  return process.env.VERCEL
    ? path.join("/tmp", "web-exhibition-data")
    : path.join(process.cwd(), ".data");
}

const DATA_DIR = getLocalDataDir();

/** Catalog JSON should not sit on a long CDN TTL — private reads bypass CDN entirely. */
const CATALOG_CACHE_SECONDS = 60;

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function logBlobError(op: string, pathname: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[blob-store] ${op} failed for ${pathname}: ${message}`);
}

function localEtag(content: string): string {
  return `"sha256-${createHash("sha256").update(content).digest("hex")}"`;
}

export class BlobWriteConflictError extends Error {
  constructor(pathname: string) {
    super(`Blob write conflict for ${pathname}`);
    this.name = "BlobWriteConflictError";
  }
}

export function isBlobWriteConflict(err: unknown): boolean {
  return (
    err instanceof BlobWriteConflictError ||
    err instanceof BlobPreconditionFailedError ||
    (err instanceof Error && err.name === "BlobPreconditionFailedError")
  );
}

export type BlobTextRead = {
  text: string | null;
  etag: string | null;
};

export type WriteBlobTextOptions = {
  contentType?: string;
  /** When set, write only if the stored object still has this ETag (CAS). */
  ifMatch?: string | null;
  /** When false, fail if the blob already exists (create-only bootstrap). Default true. */
  allowOverwrite?: boolean;
  /**
   * Storage access for this object. Catalog JSON defaults to private so
   * `useCache: false` is honored (public CDN ignores that flag and breaks CAS).
   */
  access?: "public" | "private";
};

/**
 * Read text + ETag. Missing blob → `{ text: null, etag: null }`.
 * Transport/auth failures throw (do not look like "missing").
 *
 * Catalog JSON prefers private + useCache:false. Legacy public catalog objects
 * are read via head() + authenticated `?cache=0` origin fetch so CAS does not
 * pair a CDN-stale body with a fresh ETag (root cause of prod write conflicts).
 * The next put writes access:private so subsequent reads stay strong.
 */
export async function readBlobTextDetailed(
  pathname: string,
): Promise<BlobTextRead> {
  if (hasBlobToken()) {
    const privateRead = await tryGetText(pathname, "private");
    if (privateRead) return privateRead;

    // Origin-authoritative read for legacy public catalogs (and fallback).
    const viaHead = await tryOriginTextViaHead(pathname);
    if (viaHead) return viaHead;

    const publicRead = await tryGetText(pathname, "public");
    if (publicRead) return publicRead;

    return { text: null, etag: null };
  }

  await ensureDataDir();
  const file = path.join(DATA_DIR, pathname);
  if (!existsSync(file)) return { text: null, etag: null };
  const text = await readFile(file, "utf8");
  return { text, etag: localEtag(text) };
}

async function tryGetText(
  pathname: string,
  access: "public" | "private",
): Promise<BlobTextRead | null> {
  try {
    const result = await get(pathname, {
      access,
      ...(access === "private" ? { useCache: false } : {}),
    });
    if (!result) return null;
    if (result.statusCode === 304 || !result.stream) {
      return { text: null, etag: result.blob.etag || null };
    }
    const text = await new Response(result.stream).text();
    return { text, etag: result.blob.etag || null };
  } catch (err) {
    // Wrong access mode for this object — try the other mode.
    if (err instanceof BlobNotFoundError) return null;
    const message = err instanceof Error ? err.message : String(err);
    if (/access|forbidden|unauthorized|not found/i.test(message)) return null;
    throw err;
  }
}

/**
 * head() is origin-authoritative. Fetch the blob URL with cache=0 + bearer
 * token so we do not CAS against a CDN-stale public body.
 */
async function tryOriginTextViaHead(
  pathname: string,
): Promise<BlobTextRead | null> {
  try {
    const meta = await head(pathname);
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token || !meta.url) return null;

    const url = new URL(meta.url);
    url.searchParams.set("cache", "0");
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      throw new Error(`origin fetch ${res.status} for ${pathname}`);
    }
    const text = await res.text();
    const etag = meta.etag || res.headers.get("etag") || null;
    return { text, etag };
  } catch (err) {
    if (err instanceof BlobNotFoundError) return null;
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) return null;
    // head/origin unavailable — fall through to public get.
    logBlobError("origin-read", pathname, err);
    return null;
  }
}

/** Read a JSON or binary blob by pathname key (e.g. catalog-live.json). */
export async function readBlobText(pathname: string): Promise<string | null> {
  try {
    const { text } = await readBlobTextDetailed(pathname);
    return text;
  } catch (err) {
    if (isBlobWriteConflict(err)) throw err;
    logBlobError("read", pathname, err);
    throw err;
  }
}

export async function writeBlobText(
  pathname: string,
  content: string,
  contentTypeOrOpts: string | WriteBlobTextOptions = "application/json",
): Promise<{ url: string; etag: string | null } | null> {
  const opts: WriteBlobTextOptions =
    typeof contentTypeOrOpts === "string"
      ? { contentType: contentTypeOrOpts, allowOverwrite: true }
      : contentTypeOrOpts;
  const contentType = opts.contentType ?? "application/json";
  const allowOverwrite = opts.allowOverwrite ?? true;
  const ifMatch = opts.ifMatch ?? undefined;
  // Catalog JSON defaults to private so subsequent strong reads work.
  const access = opts.access ?? "private";

  try {
    if (hasBlobToken()) {
      try {
        const result = await put(pathname, content, {
          access,
          contentType,
          addRandomSuffix: false,
          allowOverwrite: ifMatch ? true : allowOverwrite,
          ...(ifMatch ? { ifMatch } : {}),
          cacheControlMaxAge: CATALOG_CACHE_SECONDS,
        });
        return { url: result.url, etag: result.etag ?? null };
      } catch (err) {
        if (isBlobWriteConflict(err)) {
          throw new BlobWriteConflictError(pathname);
        }
        throw err;
      }
    }

    await ensureDataDir();
    const file = path.join(DATA_DIR, pathname);
    await mkdir(path.dirname(file), { recursive: true });
    if (existsSync(file)) {
      if (!allowOverwrite && !ifMatch) {
        throw new BlobWriteConflictError(pathname);
      }
      if (ifMatch) {
        const current = await readFile(file, "utf8");
        if (localEtag(current) !== ifMatch) {
          throw new BlobWriteConflictError(pathname);
        }
      }
    } else if (ifMatch) {
      // Expected an existing object for CAS — treat as conflict so caller reloads.
      throw new BlobWriteConflictError(pathname);
    }
    await writeFile(file, content, "utf8");
    return { url: `/local-blob/${pathname}`, etag: localEtag(content) };
  } catch (err) {
    if (isBlobWriteConflict(err)) throw err;
    logBlobError("write", pathname, err);
    return null;
  }
}

export async function writeBlobBinary(
  pathname: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<{ url: string } | null> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  try {
    if (hasBlobToken()) {
      const result = await put(pathname, buffer, {
        access: "public",
        contentType,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return { url: result.url };
    }

    await ensureDataDir();
    const file = path.join(DATA_DIR, pathname);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, buffer);
    return { url: `/api/local-media?path=${encodeURIComponent(pathname)}` };
  } catch (err) {
    logBlobError("writeBinary", pathname, err);
    return null;
  }
}

export async function deleteBlob(pathname: string): Promise<void> {
  try {
    if (hasBlobToken()) {
      try {
        await del(pathname);
        return;
      } catch {
        const { blobs } = await list({ prefix: pathname });
        const match = blobs.find((b) => b.pathname === pathname);
        if (match) await del(match.url);
      }
      return;
    }
    await ensureDataDir();
    const file = path.join(DATA_DIR, pathname);
    if (existsSync(file)) await unlink(file);
  } catch (err) {
    logBlobError("delete", pathname, err);
  }
}

export async function listLocalPaths(prefix = ""): Promise<string[]> {
  try {
    if (hasBlobToken()) {
      const { blobs } = await list({ prefix });
      return blobs.map((b) => b.pathname);
    }
    await ensureDataDir();
    const entries = await readdir(DATA_DIR);
    return entries.filter((e) => e.startsWith(prefix));
  } catch (err) {
    logBlobError("list", prefix || "(all)", err);
    return [];
  }
}

export function usingLocalBlobFallback(): boolean {
  return !hasBlobToken();
}
