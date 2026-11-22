import { NextRequest, NextResponse } from "next/server";
import {
  getPresenceGate,
  isPresenceBackendReady,
} from "@/lib/presence/gate-store";
import { readPresenceId } from "@/lib/presence/presence-id";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!isPresenceBackendReady()) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const id = readPresenceId(req);
  if (!id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  try {
    await getPresenceGate().leaveQueue(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("presence leave-queue failed", err);
    return NextResponse.json(
      { ok: false, reason: "leave_queue_error" },
      { status: 503 },
    );
  }
}
