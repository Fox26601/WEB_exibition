import { NextRequest, NextResponse } from "next/server";
import {
  getPresenceGate,
  isPresenceBackendReady,
} from "@/lib/presence/gate-store";
import { PRESENCE_ID_COOKIE } from "@/lib/presence/constants";
import { readPresenceId } from "@/lib/presence/presence-id";

export const runtime = "nodejs";

async function releaseFromRequest(req: NextRequest): Promise<NextResponse> {
  if (!isPresenceBackendReady()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let id = readPresenceId(req);
  if (!id) {
    try {
      const body = (await req.json()) as { id?: string };
      if (typeof body?.id === "string" && body.id.length >= 8) id = body.id;
    } catch {
      // sendBeacon / empty body
    }
  }
  if (!id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await getPresenceGate().release(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("presence release failed", err);
    return NextResponse.json({ ok: false, reason: "release_error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  return releaseFromRequest(req);
}

/** Allow sendBeacon with text body carrying the cookie id. */
export async function PUT(req: NextRequest) {
  return releaseFromRequest(req);
}

export { PRESENCE_ID_COOKIE };
