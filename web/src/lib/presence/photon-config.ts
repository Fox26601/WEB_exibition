/**
 * Server-only Photon Realtime credentials.
 * Bound via Cursor/Vercel secrets (not NEXT_PUBLIC_*).
 */

export type PhotonServerConfig = {
  appId: string;
  region: string;
};

export type PresenceConfigResponse =
  | { appId: string; region: string }
  | { disabled: true };

/** Read PHOTON_APP_ID / PHOTON_REGION from the process env. */
export function getPhotonServerConfig(): PhotonServerConfig | null {
  const appId = process.env.PHOTON_APP_ID?.trim() || "";
  const region = (
    process.env.PHOTON_REGION?.trim() || "eu"
  ).toLowerCase();
  if (!appId) return null;
  return { appId, region };
}

export function toPresenceConfigResponse(
  config: PhotonServerConfig | null,
): PresenceConfigResponse {
  if (!config) return { disabled: true };
  return { appId: config.appId, region: config.region };
}
