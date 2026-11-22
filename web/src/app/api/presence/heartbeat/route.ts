import { NextRequest, NextResponse } from "next/server";
import {
  getPresenceGate,
  isPresenceBackendReady,
} from "@/lib/presence/gate-store";
import { readPresenceId } from "@/lib/presence/presence-id";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isPresenceBackendReady()) {
    return NextResponse.json(
      { ok: false, reason: "presence_backend_missing" },
      { status: 503 },
    );
  }

  const id = readPresenceId(req);
  if (!id) {
    return NextResponse.json({ ok: false, reason: "missing_id" }, { status: 400 });
  }

  try {
    const result = await getPresenceGate().heartbeat(id);
    return NextResponse.json(result, { status: result.ok ? 200 : 409 });
  } catch (err) {
    console.error("presence heartbeat failed", err);
    return NextResponse.json({ ok: false, reason: "heartbeat_error" }, { status: 503 });
  }
}
