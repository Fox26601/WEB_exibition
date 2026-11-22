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

export async function POST(req: NextRequest) {
  if (!isPresenceBackendReady()) {
    return NextResponse.json(
      { status: "unavailable", reason: "presence_backend_missing" },
      { status: 503 },
    );
  }

  const { id, isNew } = ensurePresenceId(req);
  try {
    const result = await getPresenceGate().claim(id);
    return jsonWithPresenceCookie(result, id, isNew);
  } catch (err) {
    console.error("presence claim failed", err);
    return jsonWithPresenceCookie(
      { status: "unavailable", reason: "claim_error" },
      id,
      isNew,
      { status: 503 },
    );
  }
}
