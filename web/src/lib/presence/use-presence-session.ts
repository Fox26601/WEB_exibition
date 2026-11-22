"use client";

import { useEffect, useRef, useState } from "react";
import {
  leavePresenceQueue,
  readPresenceMode,
  setPresenceModeOffline,
  startPresenceGateSession,
} from "./gate";
import {
  connectPhotonPresence,
  isPhotonConfigured,
  type PhotonPresenceClient,
} from "./photon-client";
import type { PresencePose, RemotePresencePose } from "./types";

export type PresenceUiState =
  | { phase: "idle" }
  | { phase: "connecting" }
  | { phase: "online" }
  | { phase: "queued"; position: number }
  | { phase: "solo"; reason: string };

export type PresenceSceneApi = {
  /** True when Photon is joined and poses should sync. */
  online: boolean;
  publishPose: (pose: PresencePose) => void;
  getRemotes: () => RemotePresencePose[];
};

type Options = {
  /** Admin / build preview — presence off. */
  adminBuild?: boolean;
  enabled?: boolean;
};

/**
 * Gatekeeper + Photon session for the exhibition shell.
 * Invisible when a slot is free; overlay only while queued.
 */
export function usePresenceSession(options: Options = {}): {
  ui: PresenceUiState;
  sceneApi: PresenceSceneApi;
  enterOffline: () => void;
} {
  const adminBuild = options.adminBuild === true;
  const enabled = options.enabled !== false && !adminBuild;

  const [ui, setUi] = useState<PresenceUiState>({ phase: "idle" });
  const photonRef = useRef<PhotonPresenceClient | null>(null);
  const remotesRef = useRef<RemotePresencePose[]>([]);
  const stopGateRef = useRef<(() => void) | null>(null);

  const disconnectPhoton = () => {
    photonRef.current?.disconnect();
    photonRef.current = null;
    remotesRef.current = [];
  };

  useEffect(() => {
    if (!enabled) {
      setUi({ phase: "solo", reason: "disabled" });
      return;
    }

    if (readPresenceMode() === "offline") {
      setUi({ phase: "solo", reason: "session_offline" });
      return;
    }

    // No Photon AppId → solo, no overlay spam.
    if (!isPhotonConfigured()) {
      setUi({ phase: "solo", reason: "photon_env_missing" });
      return;
    }

    setUi({ phase: "connecting" });
    let cancelled = false;

    const stop = startPresenceGateSession({
      onOnline: () => {
        if (cancelled) return;
        setUi({ phase: "online" });
        if (photonRef.current?.isJoined()) return;
        disconnectPhoton();
        void connectPhotonPresence({
          onRemotePose: (pose) => {
            const list = remotesRef.current.filter(
              (r) => r.actorNr !== pose.actorNr,
            );
            list.push(pose);
            remotesRef.current = list;
          },
          onRemoteLeave: (actorNr) => {
            remotesRef.current = remotesRef.current.filter(
              (r) => r.actorNr !== actorNr,
            );
          },
          onFailed: (reason) => {
            if (cancelled) return;
            disconnectPhoton();
            // Room full / CCU — fail-soft solo so the exhibition stays usable.
            setUi({ phase: "solo", reason });
          },
          onJoined: () => {
            if (cancelled) return;
            setUi({ phase: "online" });
          },
        }).then((client) => {
          if (cancelled) {
            client?.disconnect();
            return;
          }
          if (!client) {
            setUi({ phase: "solo", reason: "photon_connect_failed" });
            return;
          }
          photonRef.current = client;
        });
      },
      onQueued: (position) => {
        if (cancelled) return;
        disconnectPhoton();
        setUi({ phase: "queued", position });
      },
      onSolo: (reason) => {
        if (cancelled) return;
        disconnectPhoton();
        setUi({ phase: "solo", reason });
      },
    });
    stopGateRef.current = stop;

    return () => {
      cancelled = true;
      stop();
      stopGateRef.current = null;
      disconnectPhoton();
    };
  }, [enabled, adminBuild]);

  const enterOffline = () => {
    setPresenceModeOffline();
    void leavePresenceQueue();
    stopGateRef.current?.();
    stopGateRef.current = null;
    disconnectPhoton();
    setUi({ phase: "solo", reason: "entered_offline" });
  };

  const sceneApi: PresenceSceneApi = {
    online: ui.phase === "online",
    publishPose: (pose) => {
      photonRef.current?.publishPose(pose);
    },
    getRemotes: () => remotesRef.current,
  };

  return { ui, sceneApi, enterOffline };
}
