import { put, list, del } from "@vercel/blob";
import { mkdir, readFile, writeFile, unlink, readdir } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const DATA_DIR = path.join(process.cwd(), ".data");

function hasBlobToken(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

/** Read a JSON or binary blob by pathname key (e.g. catalog-live.json). */
export async function readBlobText(pathname: string): Promise<string | null> {
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
}

export async function writeBlobText(
  pathname: string,
  content: string,
  contentType = "application/json",
): Promise<{ url: string }> {
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
}

export async function writeBlobBinary(
  pathname: string,
  data: Buffer | Uint8Array,
  contentType: string,
): Promise<{ url: string }> {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
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
}

export async function deleteBlob(pathname: string): Promise<void> {
  if (hasBlobToken()) {
    const { blobs } = await list({ prefix: pathname });
    const match = blobs.find((b) => b.pathname === pathname);
    if (match) await del(match.url);
    return;
  }
  await ensureDataDir();
  const file = path.join(DATA_DIR, pathname);
  if (existsSync(file)) await unlink(file);
}

export async function listLocalPaths(prefix = ""): Promise<string[]> {
  if (hasBlobToken()) {
    const { blobs } = await list({ prefix });
    return blobs.map((b) => b.pathname);
  }
  await ensureDataDir();
  const entries = await readdir(DATA_DIR);
  return entries.filter((e) => e.startsWith(prefix));
}

export function usingLocalBlobFallback(): boolean {
  return !hasBlobToken();
}
