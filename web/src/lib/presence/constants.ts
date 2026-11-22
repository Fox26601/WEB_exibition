/** Free Photon Realtime CCU hard cap. */
export const PRESENCE_MAX_PLAYERS = 20;

/** Active ticket TTL; client heartbeats before this. */
export const PRESENCE_TICKET_TTL_MS = 25_000;

/** Cookie that keeps FIFO place across refresh while waiting. */
export const PRESENCE_ID_COOKIE = "wg_presence_id";

/** Session preference: skip Photon + queue for this tab. */
export const PRESENCE_MODE_KEY = "wg_presence_mode";

export const PRESENCE_MODE_OFFLINE = "offline";

export const PRESENCE_ROOM_NAME = "exhibition";

export const PRESENCE_APP_VERSION = "webgalerey-1";

/** Custom Photon event for local pose broadcasts. */
export const PRESENCE_POSE_EVENT = 1;

/** Pose publish rate (~10 Hz). */
export const PRESENCE_POSE_HZ = 10;

export const PRESENCE_CLAIM_POLL_MS = 2_000;

export const PRESENCE_HEARTBEAT_MS = 10_000;

export const REDIS_ACTIVE_KEY = "presence:active";
export const REDIS_QUEUE_KEY = "presence:queue";
