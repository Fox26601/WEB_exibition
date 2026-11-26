import {
  put,
  list,
  del,
  get,
  BlobPreconditionFailedError,
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

/** Catalog JSON should not sit on a long CDN TTL — reads use useCache:false too. */
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
};

/**
 * Read text + ETag. Missing blob → `{ text: null, etag: null }`.
 * Transport/auth failures throw (do not look like "missing").
 */
export async function readBlobTextDetailed(
  pathname: string,
): Promise<BlobTextRead> {
  if (hasBlobToken()) {
    const result = await get(pathname, {
      access: "public",
      useCache: false,
    });
    if (!result) return { text: null, etag: null };
    if (result.statusCode === 304 || !result.stream) {
      return { text: null, etag: result.blob.etag };
    }
    const text = await new Response(result.stream).text();
    return { text, etag: result.blob.etag };
  }

  await ensureDataDir();
  const file = path.join(DATA_DIR, pathname);
  if (!existsSync(file)) return { text: null, etag: null };
  const text = await readFile(file, "utf8");
  return { text, etag: localEtag(text) };
}

/** Read a JSON or binary blob by pathname key (e.g. catalog-live.json). */
export async function readBlobText(pathname: string): Promise<string | null> {
  try {
    const { text } = await readBlobTextDetailed(pathname);
    return text;
  } catch (err) {
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

  try {
    if (hasBlobToken()) {
      try {
        const result = await put(pathname, content, {
          access: "public",
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
