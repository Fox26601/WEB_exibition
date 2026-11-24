import { put, list, del } from "@vercel/blob";
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

/** Read a JSON or binary blob by pathname key (e.g. catalog-live.json). */
export async function readBlobText(pathname: string): Promise<string | null> {
  try {
    if (hasBlobToken()) {
      const { blobs } = await list({ prefix: pathname });
      const match = blobs.find((b) => b.pathname === pathname);
      if (!match) return null;
      const res = await fetch(match.url, { cache: "no-store" });
      if (!res.ok) return null;
      return res.text();
    }

    await ensureDataDir();
    const file = path.join(DATA_DIR, pathname);
    if (!existsSync(file)) return null;
    return readFile(file, "utf8");
  } catch (err) {
    logBlobError("read", pathname, err);
    return null;
  }
}

export async function writeBlobText(
  pathname: string,
  content: string,
  contentType = "application/json",
): Promise<{ url: string } | null> {
  try {
    if (hasBlobToken()) {
      const result = await put(pathname, content, {
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
    await writeFile(file, content, "utf8");
    return { url: `/local-blob/${pathname}` };
  } catch (err) {
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
      const { blobs } = await list({ prefix: pathname });
      const match = blobs.find((b) => b.pathname === pathname);
      if (match) await del(match.url);
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
