import { PRESENCE_MAX_PLAYERS, PRESENCE_TICKET_TTL_MS } from "./constants";

export type GateState = {
  /** visitorId → expiry epoch ms */
  active: Map<string, number>;
  /** FIFO waiter ids (no duplicates). */
  queue: string[];
};

export type ClaimOk = {
  status: "ok";
  ticket: string;
  active: number;
  expiresAt: number;
};

export type ClaimQueued = {
  status: "queued";
  position: number;
  active: number;
};

export type ClaimResult = ClaimOk | ClaimQueued;

export type GateStatus = {
  active: number;
  queued: number;
  self: "active" | "queued" | "none";
  position: number | null;
  expiresAt: number | null;
};

export function createGateState(): GateState {
  return { active: new Map(), queue: [] };
}

export function cloneGateState(state: GateState): GateState {
  return {
    active: new Map(state.active),
    queue: [...state.queue],
  };
}

/** Drop expired tickets and promote queue head into free slots. */
export function purgeAndPromote(
  state: GateState,
  now: number,
  maxPlayers = PRESENCE_MAX_PLAYERS,
  ttlMs = PRESENCE_TICKET_TTL_MS,
): void {
  for (const [id, expiry] of state.active) {
    if (expiry <= now) state.active.delete(id);
  }

  while (state.active.size < maxPlayers && state.queue.length > 0) {
    const next = state.queue.shift();
    if (!next) break;
    if (state.active.has(next)) continue;
    state.active.set(next, now + ttlMs);
  }
}

function queuePosition(state: GateState, id: string): number {
  const idx = state.queue.indexOf(id);
  return idx < 0 ? -1 : idx + 1;
}

function ensureQueued(state: GateState, id: string): number {
  const existing = queuePosition(state, id);
  if (existing > 0) return existing;
  state.queue.push(id);
  return state.queue.length;
}

/**
 * Claim or refresh a slot. If full, enqueue FIFO and return position.
 * Promoting expired slots happens before the claim.
 */
export function claimSlot(
  state: GateState,
  id: string,
  now: number,
  maxPlayers = PRESENCE_MAX_PLAYERS,
  ttlMs = PRESENCE_TICKET_TTL_MS,
): ClaimResult {
  purgeAndPromote(state, now, maxPlayers, ttlMs);

  const existingExpiry = state.active.get(id);
  if (existingExpiry !== undefined && existingExpiry > now) {
    const expiresAt = now + ttlMs;
    state.active.set(id, expiresAt);
    // Already active — ensure not also waiting.
    state.queue = state.queue.filter((q) => q !== id);
    return {
      status: "ok",
      ticket: id,
      active: state.active.size,
      expiresAt,
    };
  }

  if (state.active.size < maxPlayers) {
    state.queue = state.queue.filter((q) => q !== id);
    const expiresAt = now + ttlMs;
    state.active.set(id, expiresAt);
    return {
      status: "ok",
      ticket: id,
      active: state.active.size,
      expiresAt,
    };
  }

  const position = ensureQueued(state, id);
  return {
    status: "queued",
    position,
    active: state.active.size,
  };
}

export function heartbeatSlot(
  state: GateState,
  id: string,
  now: number,
  ttlMs = PRESENCE_TICKET_TTL_MS,
): { ok: boolean; expiresAt: number | null } {
  purgeAndPromote(state, now);
  const expiry = state.active.get(id);
  if (expiry === undefined || expiry <= now) {
    return { ok: false, expiresAt: null };
  }
  const expiresAt = now + ttlMs;
  state.active.set(id, expiresAt);
  return { ok: true, expiresAt };
}

/** Free an active slot (and promote queue head). */
export function releaseSlot(
  state: GateState,
  id: string,
  now: number,
  maxPlayers = PRESENCE_MAX_PLAYERS,
  ttlMs = PRESENCE_TICKET_TTL_MS,
): void {
  state.active.delete(id);
  state.queue = state.queue.filter((q) => q !== id);
  purgeAndPromote(state, now, maxPlayers, ttlMs);
}

/** Drop from FIFO only — does not take or free an active slot. */
export function leaveQueue(state: GateState, id: string): void {
  state.queue = state.queue.filter((q) => q !== id);
}

export function getGateStatus(
  state: GateState,
  id: string,
  now: number,
  maxPlayers = PRESENCE_MAX_PLAYERS,
  ttlMs = PRESENCE_TICKET_TTL_MS,
): GateStatus {
  purgeAndPromote(state, now, maxPlayers, ttlMs);
  const expiry = state.active.get(id);
  if (expiry !== undefined && expiry > now) {
    return {
      active: state.active.size,
      queued: state.queue.length,
      self: "active",
      position: null,
      expiresAt: expiry,
    };
  }
  const position = queuePosition(state, id);
  if (position > 0) {
    return {
      active: state.active.size,
      queued: state.queue.length,
      self: "queued",
      position,
      expiresAt: null,
    };
  }
  return {
    active: state.active.size,
    queued: state.queue.length,
    self: "none",
    position: null,
    expiresAt: null,
  };
}

export function serializeGateState(state: GateState): {
  active: Record<string, number>;
  queue: string[];
} {
  const active: Record<string, number> = {};
  for (const [id, expiry] of state.active) active[id] = expiry;
  return { active, queue: [...state.queue] };
}

export function deserializeGateState(raw: {
  active?: Record<string, number>;
  queue?: string[];
}): GateState {
  const active = new Map<string, number>();
  if (raw.active) {
    for (const [id, expiry] of Object.entries(raw.active)) {
      if (typeof expiry === "number") active.set(id, expiry);
    }
  }
  const queue = Array.isArray(raw.queue)
    ? raw.queue.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  return { active, queue };
}
