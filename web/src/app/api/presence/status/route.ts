import { NextRequest, NextResponse } from "next/server";
import {
  getPresenceGate,
  isPresenceBackendReady,
} from "@/lib/presence/gate-store";
import {
  ensurePresenceId,
  jsonWithPresenceCookie,
} from "@/lib/presence/presence-id";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!isPresenceBackendReady()) {
    return NextResponse.json(
      { status: "unavailable", reason: "presence_backend_missing" },
      { status: 503 },
    );
  }

  const { id, isNew } = ensurePresenceId(req);
  try {
    const status = await getPresenceGate().status(id);
    return jsonWithPresenceCookie(status, id, isNew);
  } catch (err) {
    console.error("presence status failed", err);
    return jsonWithPresenceCookie(
      { status: "unavailable", reason: "status_error" },
      id,
      isNew,
      { status: 503 },
    );
  }
}
