import { NextResponse } from "next/server";
import {
  getPhotonServerConfig,
  toPresenceConfigResponse,
} from "@/lib/presence/photon-config";

export const runtime = "nodejs";

/**
 * Browser-facing Photon AppId + region.
 * Secrets stay server-side (PHOTON_APP_ID / PHOTON_REGION); clients must not
 * rely on NEXT_PUBLIC_PHOTON_*.
 */
export async function GET() {
  const body = toPresenceConfigResponse(getPhotonServerConfig());
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
