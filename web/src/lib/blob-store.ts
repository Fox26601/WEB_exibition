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

/**
 * True when put/get used the wrong store access mode.
 * Public stores reject `access: "private"` (put message is explicit; get returns
 * `Failed to fetch blob: 400 Bad Request` against `*.private.blob…`).
 */
export function isBlobStoreAccessMismatch(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /Cannot use (private|public) access on a (public|private) store|Failed to fetch blob:\s*400/i.test(
    message,
  );
}

/**
 * get() errors that must not abort the public/origin fallback chain.
 * A hard throw here takes down homepage SSR and GET /api/catalog (prod 500).
 */
export function blobGetErrorIsSoftMiss(err: unknown): boolean {
  if (err instanceof BlobNotFoundError) return true;
  const message = err instanceof Error ? err.message : String(err);
  if (
    /access|forbidden|unauthorized|not found|does not exist/i.test(message)
  ) {
    return true;
  }
  if (isBlobStoreAccessMismatch(err)) return true;
  // Network / undici failures against the wrong *.private host, etc.
  if (/Failed to fetch blob|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return true;
  }
  return false;
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
   * Preferred storage access. Catalog JSON prefers private so `useCache: false`
   * works on private stores. On a public store the SDK rejects private put/get;
   * we fall back to public, drop ifMatch (CDN cannot strong-read), and use a
   * process-local write-through cache so admin RMW does not 503.
   */
  access?: "public" | "private";
};

type BlobAccess = "public" | "private";

/** Remember which access mode this store actually accepts (process-local). */
let resolvedStoreAccess: BlobAccess | null = null;

/**
 * Write-through cache for public-store catalog JSON.
 * Public CDN ignores useCache:false / cache=0, so same-isolate reads after a
 * put must not re-fetch a stale CDN body and then ifMatch-fail (or LWW-clobber).
 */
const publicWriteThrough = new Map<string, { etag: string; text: string }>();

function rememberStoreAccess(access: BlobAccess): void {
  resolvedStoreAccess = access;
}

/** Test/helper: which access mode this process resolved (null = unknown). */
export function getResolvedBlobStoreAccess(): BlobAccess | null {
  return resolvedStoreAccess;
}

/** Test helper: clear process-local store access + write-through cache. */
export function resetBlobStoreAccessStateForTests(): void {
  resolvedStoreAccess = null;
  publicWriteThrough.clear();
}

/**
 * Compare-and-swap tokens are only safe when the read was origin-strong.
 * Private stores honor useCache:false; public CDN does not — passing ifMatch
 * there pairs a CDN body/etag with origin preconditions and 503s forever.
 */
export function casIfMatchForAccess(
  access: BlobAccess,
  ifMatch: string | null | undefined,
): string | undefined {
  if (!ifMatch) return undefined;
  if (access === "public") return undefined;
  return ifMatch;
}

function accessCandidates(preferred: BlobAccess): BlobAccess[] {
  if (resolvedStoreAccess) {
    const other: BlobAccess =
      resolvedStoreAccess === "private" ? "public" : "private";
    // Prefer the resolved mode; keep the opposite as a one-shot fallback.
    return [resolvedStoreAccess, other];
  }
  return preferred === "private" ? ["private", "public"] : ["public", "private"];
}

function rememberAccessFromBlobUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    const host = new URL(url).host;
    if (host.includes(".private.")) rememberStoreAccess("private");
    else if (host.includes(".public.")) rememberStoreAccess("public");
  } catch {
    /* ignore */
  }
}

function rememberPublicWriteThrough(
  pathname: string,
  text: string,
  etag: string | null | undefined,
): void {
  if (!etag) return;
  publicWriteThrough.set(pathname, { etag, text });
}

function readPublicWriteThrough(
  pathname: string,
  etag: string | null | undefined,
): string | null {
  if (!etag) return null;
  const hit = publicWriteThrough.get(pathname);
  if (!hit) return null;
  return hit.etag === etag ? hit.text : null;
}

/**
 * Read text + ETag. Missing blob → `{ text: null, etag: null }`.
 *
 * Prefer private + useCache:false when the store supports it. On public stores
 * (prod webgalerey), private get throws 400 — soft-miss and fall through to
 * head()+fetch (write-through when possible) then public get. Public puts omit
 * ifMatch because the CDN cannot provide origin-strong reads for CAS.
 */
export async function readBlobTextDetailed(
  pathname: string,
): Promise<BlobTextRead> {
  if (hasBlobToken()) {
    // Private store: strong read via get(useCache:false). Soft-miss on public
    // stores (400 against *.private.blob…) so we can fall through.
    if (resolvedStoreAccess !== "public") {
      const privateRead = await tryGetText(pathname, "private");
      if (privateRead?.text != null) {
        rememberStoreAccess("private");
        return privateRead;
      }
    }

    // Origin-authoritative — required on public stores where useCache:false is
    // ignored by the SDK (keeps CAS ifMatch paired with a fresh body/ETag).
    const viaHead = await tryOriginTextViaHead(pathname);
    if (viaHead?.text != null) return viaHead;

    // Last resort: public get (may be CDN-cached).
    if (resolvedStoreAccess !== "private") {
      const publicRead = await tryGetText(pathname, "public");
      if (publicRead?.text != null) {
        rememberStoreAccess("public");
        return publicRead;
      }
    }

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
  access: BlobAccess,
): Promise<BlobTextRead | null> {
  try {
    const result = await get(pathname, {
      access,
      ...(access === "private" ? { useCache: false } : {}),
    });
    if (!result) return null;
    if (result.statusCode === 304 || !result.stream) {
      // No body — do not treat as a hit that skips origin/public fallbacks.
      return null;
    }
    const text = await new Response(result.stream).text();
    rememberAccessFromBlobUrl(result.blob.url);
    return { text, etag: result.blob.etag || null };
  } catch (err) {
    if (blobGetErrorIsSoftMiss(err)) {
      if (isBlobStoreAccessMismatch(err)) {
        // Opposite mode is the only viable get for this store.
        rememberStoreAccess(access === "private" ? "public" : "private");
      }
      return null;
    }
    logBlobError(`get:${access}`, pathname, err);
    // Still soft-miss: catalog load must not 500 when another access path works.
    return null;
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

    rememberAccessFromBlobUrl(meta.url);

    const url = new URL(meta.url);
    const isPrivateHost = url.host.includes(".private.");

    // Public store: prefer same-isolate write-through (CDN cannot bypass).
    if (!isPrivateHost) {
      const cached = readPublicWriteThrough(pathname, meta.etag);
      if (cached != null) {
        return { text: cached, etag: meta.etag || null };
      }
    }

    // cache=0 is only valid on private stores; on public it returns HTTP 400.
    if (isPrivateHost) {
      url.searchParams.set("cache", "0");
    }
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
    const responseEtag = res.headers.get("etag");
    if (isPrivateHost) {
      // Private: head etag is origin-fresh with cache=0 body.
      return { text, etag: meta.etag || responseEtag || null };
    }

    // Public: body is CDN-served. Only treat as strongly paired when the
    // response etag matches head (origin). Otherwise keep the body for reads
    // but tag with the response etag (never hand origin etag + stale body to
    // ifMatch — putWithAccessFallback also drops ifMatch on public puts).
    if (responseEtag && meta.etag && responseEtag === meta.etag) {
      rememberPublicWriteThrough(pathname, text, meta.etag);
      return { text, etag: meta.etag };
    }
    return { text, etag: responseEtag || meta.etag || null };
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

async function putWithAccessFallback(
  pathname: string,
  content: string,
  opts: {
    preferredAccess: BlobAccess;
    contentType: string;
    allowOverwrite: boolean;
    ifMatch?: string;
  },
): Promise<{ url: string; etag: string | null }> {
  const candidates = accessCandidates(opts.preferredAccess);
  let lastMismatch: unknown;
  for (const access of candidates) {
    // Public CDN cannot strong-read; never send ifMatch on public puts.
    const ifMatch = casIfMatchForAccess(access, opts.ifMatch);
    try {
      const result = await put(pathname, content, {
        access,
        contentType: opts.contentType,
        addRandomSuffix: false,
        // Without ifMatch, honor caller allowOverwrite (bootstrap uses false).
        allowOverwrite: ifMatch ? true : opts.allowOverwrite,
        ...(ifMatch ? { ifMatch } : {}),
        cacheControlMaxAge: CATALOG_CACHE_SECONDS,
      });
      rememberStoreAccess(access);
      rememberAccessFromBlobUrl(result.url);
      if (access === "public") {
        rememberPublicWriteThrough(pathname, content, result.etag ?? null);
      }
      return { url: result.url, etag: result.etag ?? null };
    } catch (err) {
      if (isBlobWriteConflict(err)) {
        // Public + ifMatch should be unreachable; if a stale token still
        // races in, retry once without CAS so admin edit/delete can proceed.
        if (access === "public" && opts.ifMatch) {
          logBlobError("write-public-cas-fallback", pathname, err);
          try {
            const result = await put(pathname, content, {
              access: "public",
              contentType: opts.contentType,
              addRandomSuffix: false,
              allowOverwrite: true,
              cacheControlMaxAge: CATALOG_CACHE_SECONDS,
            });
            rememberStoreAccess("public");
            rememberAccessFromBlobUrl(result.url);
            rememberPublicWriteThrough(pathname, content, result.etag ?? null);
            return { url: result.url, etag: result.etag ?? null };
          } catch (retryErr) {
            if (isBlobWriteConflict(retryErr)) {
              throw new BlobWriteConflictError(pathname);
            }
            throw retryErr;
          }
        }
        throw new BlobWriteConflictError(pathname);
      }
      if (isBlobStoreAccessMismatch(err) && candidates.length > 1) {
        rememberStoreAccess(access === "private" ? "public" : "private");
        lastMismatch = err;
        logBlobError(`write-access-fallback:${access}`, pathname, err);
        continue;
      }
      throw err;
    }
  }
  throw lastMismatch instanceof Error
    ? lastMismatch
    : new Error(`Blob write access mismatch for ${pathname}`);
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
  // Prefer private when the store supports it; fall back on public stores.
  const access = opts.access ?? "private";

  try {
    if (hasBlobToken()) {
      try {
        const result = await putWithAccessFallback(pathname, content, {
          preferredAccess: access,
          contentType,
          allowOverwrite: ifMatch ? true : allowOverwrite,
          ifMatch,
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
