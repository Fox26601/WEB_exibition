import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { loadCatalog } from "@/lib/catalog";
import { writeBlobText } from "@/lib/blob-store";

const feedbackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(200),
  message: z.string().trim().min(1).max(5000),
});

/** Best-effort in-memory rate limit (per serverless isolate). */
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 5;

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}

function allowRequest(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_HITS) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

export async function POST(req: NextRequest) {
  const key = clientKey(req);
  if (!allowRequest(key)) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = feedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const catalog = await loadCatalog("live");
  const destination = catalog.settings.email?.trim() || "";

  const id = uuidv4();
  const receivedAt = new Date().toISOString();
  const pathname = `feedback/${receivedAt.slice(0, 10)}-${id}.json`;
  const payload = {
    id,
    ...parsed.data,
    destination,
    receivedAt,
  };

  await writeBlobText(pathname, JSON.stringify(payload, null, 2));

  return NextResponse.json({
    ok: true,
    id,
    destination: destination || null,
  });
}
