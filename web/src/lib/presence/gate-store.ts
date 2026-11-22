import { Redis } from "@upstash/redis";
import {
  PRESENCE_MAX_PLAYERS,
  PRESENCE_TICKET_TTL_MS,
  REDIS_ACTIVE_KEY,
  REDIS_QUEUE_KEY,
} from "./constants";
import {
  claimSlot,
  createGateState,
  deserializeGateState,
  getGateStatus,
  heartbeatSlot,
  leaveQueue,
  releaseSlot,
  serializeGateState,
  type ClaimResult,
  type GateState,
  type GateStatus,
} from "./gate-logic";

const STATE_KEY = "presence:state";

export type PresenceGate = {
  configured: boolean;
  claim(id: string, now?: number): Promise<ClaimResult>;
  heartbeat(id: string, now?: number): Promise<{ ok: boolean; expiresAt: number | null }>;
  release(id: string, now?: number): Promise<void>;
  leaveQueue(id: string): Promise<void>;
  status(id: string, now?: number): Promise<GateStatus>;
};

/** Dev / test in-process store (not shared across serverless isolates). */
let memoryState: GateState | null = null;

function getMemoryState(): GateState {
  if (!memoryState) memoryState = createGateState();
  return memoryState;
}

/** Reset in-memory gate (unit tests only). */
export function resetMemoryGateForTests(): void {
  memoryState = createGateState();
}

function redisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() &&
      process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

function createRedis(): Redis | null {
  if (!redisConfigured()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

async function loadRedisState(redis: Redis): Promise<GateState> {
  const raw = await redis.get<unknown>(STATE_KEY);
  if (!raw || typeof raw !== "object") return createGateState();
  return deserializeGateState(raw as { active?: Record<string, number>; queue?: string[] });
}

async function saveRedisState(redis: Redis, state: GateState): Promise<void> {
  const payload = serializeGateState(state);
  // TTL on the blob itself is long; per-ticket expiry lives inside the payload.
  await redis.set(STATE_KEY, payload, { ex: 60 * 60 * 24 });
  // Keep legacy keys in sync for operators inspecting Redis.
  await redis.del(REDIS_ACTIVE_KEY, REDIS_QUEUE_KEY);
  if (Object.keys(payload.active).length > 0) {
    await redis.hset(REDIS_ACTIVE_KEY, payload.active);
  }
  if (payload.queue.length > 0) {
    await redis.rpush(REDIS_QUEUE_KEY, ...payload.queue);
  }
}

/**
 * Mutual exclusion for Redis mutations via a short lock.
 * Upstash REST has no MULTI/WATCH across requests; lock + read-modify-write
 * is enough for the 20-CCU gate.
 */
async function withRedisLock<T>(
  redis: Redis,
  fn: (state: GateState) => T | Promise<T>,
): Promise<T> {
  const lockKey = "presence:lock";
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const maxAttempts = 12;
  for (let i = 0; i < maxAttempts; i++) {
    const got = await redis.set(lockKey, token, { nx: true, px: 2_000 });
    // Upstash returns "OK" on success, null when NX fails.
    if (got) {
      try {
        const state = await loadRedisState(redis);
        const result = await fn(state);
        await saveRedisState(redis, state);
        return result;
      } finally {
        const cur = await redis.get<string>(lockKey);
        if (cur === token) await redis.del(lockKey);
      }
    }
    await new Promise((r) => setTimeout(r, 25 + i * 15));
  }
  // Last attempt without exclusive lock — still better than failing the visit.
  const state = await loadRedisState(redis);
  const result = await fn(state);
  await saveRedisState(redis, state);
  return result;
}

function memoryGate(): PresenceGate {
  return {
    configured: true,
    async claim(id, now = Date.now()) {
      return claimSlot(
        getMemoryState(),
        id,
        now,
        PRESENCE_MAX_PLAYERS,
        PRESENCE_TICKET_TTL_MS,
      );
    },
    async heartbeat(id, now = Date.now()) {
      return heartbeatSlot(getMemoryState(), id, now, PRESENCE_TICKET_TTL_MS);
    },
    async release(id, now = Date.now()) {
      releaseSlot(
        getMemoryState(),
        id,
        now,
        PRESENCE_MAX_PLAYERS,
        PRESENCE_TICKET_TTL_MS,
      );
    },
    async leaveQueue(id) {
      leaveQueue(getMemoryState(), id);
    },
    async status(id, now = Date.now()) {
      return getGateStatus(
        getMemoryState(),
        id,
        now,
        PRESENCE_MAX_PLAYERS,
        PRESENCE_TICKET_TTL_MS,
      );
    },
  };
}

function redisGate(redis: Redis): PresenceGate {
  return {
    configured: true,
    async claim(id, now = Date.now()) {
      return withRedisLock(redis, (state) =>
        claimSlot(state, id, now, PRESENCE_MAX_PLAYERS, PRESENCE_TICKET_TTL_MS),
      );
    },
    async heartbeat(id, now = Date.now()) {
      return withRedisLock(redis, (state) =>
        heartbeatSlot(state, id, now, PRESENCE_TICKET_TTL_MS),
      );
    },
    async release(id, now = Date.now()) {
      await withRedisLock(redis, (state) => {
        releaseSlot(
          state,
          id,
          now,
          PRESENCE_MAX_PLAYERS,
          PRESENCE_TICKET_TTL_MS,
        );
      });
    },
    async leaveQueue(id) {
      await withRedisLock(redis, (state) => {
        leaveQueue(state, id);
      });
    },
    async status(id, now = Date.now()) {
      return withRedisLock(redis, (state) =>
        getGateStatus(
          state,
          id,
          now,
          PRESENCE_MAX_PLAYERS,
          PRESENCE_TICKET_TTL_MS,
        ),
      );
    },
  };
}

/**
 * Production: Upstash when env is set.
 * Local/dev without Redis: in-memory gate so claim still works on one process.
 * Callers that need "secrets missing → solo" should check `isPresenceBackendReady`.
 */
export function getPresenceGate(): PresenceGate {
  const redis = createRedis();
  if (redis) return redisGate(redis);
  return memoryGate();
}

/** True when Upstash is configured (or explicit local memory is acceptable). */
export function isPresenceBackendReady(): boolean {
  if (redisConfigured()) return true;
  // Allow in-memory only outside production so local `next dev` can exercise the gate.
  return process.env.NODE_ENV !== "production";
}

export function isRedisPresenceConfigured(): boolean {
  return redisConfigured();
}
