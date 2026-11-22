"use client";

import {
  PRESENCE_CLAIM_POLL_MS,
  PRESENCE_HEARTBEAT_MS,
  PRESENCE_ID_COOKIE,
  PRESENCE_MODE_KEY,
  PRESENCE_MODE_OFFLINE,
} from "./constants";

export type ClaimOkResponse = {
  status: "ok";
  ticket: string;
  active: number;
  expiresAt: number;
};

export type ClaimQueuedResponse = {
  status: "queued";
  position: number;
  active: number;
};

export type ClaimUnavailableResponse = {
  status: "unavailable";
  reason?: string;
};

export type ClaimResponse =
  | ClaimOkResponse
  | ClaimQueuedResponse
  | ClaimUnavailableResponse;

export function readPresenceMode(): "offline" | "online" | null {
  if (typeof window === "undefined") return null;
  try {
    const v = sessionStorage.getItem(PRESENCE_MODE_KEY);
    if (v === PRESENCE_MODE_OFFLINE) return "offline";
    if (v === "online") return "online";
  } catch {
    // private mode
  }
  return null;
}

export function setPresenceModeOffline(): void {
  try {
    sessionStorage.setItem(PRESENCE_MODE_KEY, PRESENCE_MODE_OFFLINE);
  } catch {
    // ignore
  }
}

export function clearPresenceMode(): void {
  try {
    sessionStorage.removeItem(PRESENCE_MODE_KEY);
  } catch {
    // ignore
  }
}

export function readPresenceIdFromDocument(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${PRESENCE_ID_COOKIE}=`));
  if (!match) return null;
  const value = decodeURIComponent(match.slice(PRESENCE_ID_COOKIE.length + 1));
  return value || null;
}

export async function claimPresenceSlot(): Promise<ClaimResponse> {
  try {
    const res = await fetch("/api/presence/claim", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    const data = (await res.json()) as ClaimResponse;
    if (!res.ok && data.status !== "unavailable") {
      return { status: "unavailable", reason: "http_error" };
    }
    return data;
  } catch {
    return { status: "unavailable", reason: "network_error" };
  }
}

export async function heartbeatPresenceSlot(): Promise<boolean> {
  try {
    const res = await fetch("/api/presence/heartbeat", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { ok?: boolean };
    return Boolean(data.ok);
  } catch {
    return false;
  }
}

export async function releasePresenceSlot(): Promise<void> {
  const id = readPresenceIdFromDocument();
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const body = id ? JSON.stringify({ id }) : "";
      navigator.sendBeacon(
        "/api/presence/release",
        new Blob([body], { type: "application/json" }),
      );
      return;
    }
    await fetch("/api/presence/release", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: id ? { "Content-Type": "application/json" } : undefined,
      body: id ? JSON.stringify({ id }) : undefined,
    });
  } catch {
    // unload path — best effort
  }
}

export async function leavePresenceQueue(): Promise<void> {
  try {
    await fetch("/api/presence/leave-queue", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    // fail-soft: local offline mode still proceeds
  }
}

export type PresenceSessionCallbacks = {
  onOnline: () => void;
  onQueued: (position: number) => void;
  onSolo: (reason: string) => void;
};

/**
 * Poll claim until online or solo. Heartbeats while holding a ticket.
 * Returns a disposer that releases the slot.
 */
export function startPresenceGateSession(
  callbacks: PresenceSessionCallbacks,
): () => void {
  let stopped = false;
  let claimTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let holdingTicket = false;

  const clearTimers = () => {
    if (claimTimer) {
      clearTimeout(claimTimer);
      claimTimer = null;
    }
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  const startHeartbeat = () => {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(() => {
      void heartbeatPresenceSlot().then((ok) => {
        if (stopped) return;
        if (!ok) {
          holdingTicket = false;
          clearTimers();
          scheduleClaim(0);
        }
      });
    }, PRESENCE_HEARTBEAT_MS);
  };

  const scheduleClaim = (delay: number) => {
    if (stopped) return;
    claimTimer = setTimeout(() => {
      void (async () => {
        if (stopped) return;
        const result = await claimPresenceSlot();
        if (stopped) return;
        if (result.status === "ok") {
          holdingTicket = true;
          callbacks.onOnline();
          startHeartbeat();
          return;
        }
        if (result.status === "queued") {
          holdingTicket = false;
          callbacks.onQueued(result.position);
          scheduleClaim(PRESENCE_CLAIM_POLL_MS);
          return;
        }
        holdingTicket = false;
        callbacks.onSolo(result.reason || "unavailable");
      })();
    }, delay);
  };

  const onUnload = () => {
    if (holdingTicket) void releasePresenceSlot();
  };
  window.addEventListener("pagehide", onUnload);
  window.addEventListener("beforeunload", onUnload);

  scheduleClaim(0);

  return () => {
    stopped = true;
    clearTimers();
    window.removeEventListener("pagehide", onUnload);
    window.removeEventListener("beforeunload", onUnload);
    if (holdingTicket) void releasePresenceSlot();
    holdingTicket = false;
  };
}
