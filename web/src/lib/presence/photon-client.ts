"use client";

import {
  PRESENCE_APP_VERSION,
  PRESENCE_POSE_EVENT,
  PRESENCE_ROOM_NAME,
} from "./constants";
import type { PresencePose, RemotePresencePose } from "./types";
import { readPresenceIdFromDocument } from "./gate";

export type PhotonPresenceClient = {
  disconnect: () => void;
  publishPose: (pose: PresencePose) => void;
  getRemotes: () => RemotePresencePose[];
  isJoined: () => boolean;
};

export type PhotonPresenceHandlers = {
  onRemotePose?: (pose: RemotePresencePose) => void;
  onRemoteLeave?: (actorNr: number) => void;
  onJoined?: () => void;
  onFailed?: (reason: string) => void;
};

function photonEnv(): { appId: string; region: string } | null {
  const appId = process.env.NEXT_PUBLIC_PHOTON_APP_ID?.trim() || "";
  const region = (
    process.env.NEXT_PUBLIC_PHOTON_REGION?.trim() || "eu"
  ).toLowerCase();
  if (!appId) return null;
  return { appId, region };
}

export function isPhotonConfigured(): boolean {
  return photonEnv() !== null;
}

/**
 * Connect anonymously and joinOrCreate room `exhibition` (MaxPlayers 20).
 * Fail-soft: returns null if SDK/env unavailable.
 */
export async function connectPhotonPresence(
  handlers: PhotonPresenceHandlers = {},
): Promise<PhotonPresenceClient | null> {
  const env = photonEnv();
  if (!env) {
    handlers.onFailed?.("photon_env_missing");
    return null;
  }

  let Photon: typeof import("photon-realtime").default;
  try {
    Photon = (await import("photon-realtime")).default;
  } catch (err) {
    console.warn("photon-realtime import failed", err);
    handlers.onFailed?.("photon_import_failed");
    return null;
  }

  // Prefer browser WebSocket when Photon's Node ws shim is absent.
  if (typeof window !== "undefined" && window.WebSocket) {
    try {
      Photon.PhotonPeer.setWebSocketImpl(window.WebSocket);
    } catch {
      // keep package default
    }
  }

  const LBC = Photon.LoadBalancing.LoadBalancingClient;
  const client = new LBC(
    Photon.ConnectionProtocol.Wss,
    env.appId,
    PRESENCE_APP_VERSION,
  );

  const remotes = new Map<number, RemotePresencePose>();
  let joined = false;
  let disposed = false;
  let failed = false;

  const userId = readPresenceIdFromDocument();
  if (userId) client.setUserId(userId);

  const fail = (reason: string) => {
    if (disposed || failed) return;
    failed = true;
    handlers.onFailed?.(reason);
    try {
      client.disconnect();
    } catch {
      // ignore
    }
  };

  client.onError = (errorCode, errorMsg) => {
    const codes = Photon.LoadBalancing.Constants.ErrorCode;
    if (
      errorCode === codes.MaxCcuReached ||
      errorCode === codes.GameFull ||
      errorCode === codes.ServerFull
    ) {
      fail("room_full");
      return;
    }
    console.warn("photon error", errorCode, errorMsg);
    fail(`photon_error_${errorCode}`);
  };

  client.onStateChange = (state) => {
    if (disposed) return;
    if (state === LBC.State.JoinedLobby) {
      client.joinRoom(
        PRESENCE_ROOM_NAME,
        { createIfNotExists: true },
        { maxPlayers: 20, isOpen: true, isVisible: true },
      );
      return;
    }
    if (state === LBC.State.Joined) {
      joined = true;
      handlers.onJoined?.();
      return;
    }
    if (state === LBC.State.Error || state === LBC.State.Disconnected) {
      if (joined && !disposed) {
        joined = false;
      }
    }
  };

  client.onEvent = (code, content, actorNr) => {
    if (disposed || code !== PRESENCE_POSE_EVENT) return;
    if (typeof content !== "object" || content === null) return;
    const pose = content as Partial<PresencePose>;
    if (
      typeof pose.x !== "number" ||
      typeof pose.y !== "number" ||
      typeof pose.z !== "number" ||
      typeof pose.yaw !== "number"
    ) {
      return;
    }
    const myNr = client.myActor()?.actorNr;
    if (actorNr === myNr) return;
    const remote: RemotePresencePose = {
      actorNr,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      yaw: pose.yaw,
      updatedAt: Date.now(),
    };
    remotes.set(actorNr, remote);
    handlers.onRemotePose?.(remote);
  };

  client.onActorLeave = (actor) => {
    if (!actor || actor.isLocal) return;
    remotes.delete(actor.actorNr);
    handlers.onRemoteLeave?.(actor.actorNr);
  };

  await new Promise<void>((resolve) => {
    Photon.setOnLoad(() => resolve());
    // setOnLoad may already have fired for this module load.
    resolve();
  });

  try {
    const ok = client.connectToRegionMaster(env.region);
    if (!ok) {
      fail("connect_failed");
      return null;
    }
  } catch (err) {
    console.warn("photon connect failed", err);
    fail("connect_exception");
    return null;
  }

  return {
    disconnect: () => {
      disposed = true;
      remotes.clear();
      try {
        if (client.isJoinedToRoom()) client.leaveRoom();
      } catch {
        // ignore
      }
      try {
        client.disconnect();
      } catch {
        // ignore
      }
    },
    publishPose: (pose) => {
      if (disposed || !joined) return;
      try {
        client.raiseEvent(PRESENCE_POSE_EVENT, pose, {
          receivers: Photon.LoadBalancing.Constants.ReceiverGroup.Others,
        });
      } catch {
        // ignore transient send errors
      }
    },
    getRemotes: () => Array.from(remotes.values()),
    isJoined: () => joined && !disposed,
  };
}
