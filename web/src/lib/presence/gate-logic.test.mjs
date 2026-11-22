import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  claimSlot,
  createGateState,
  getGateStatus,
  leaveQueue,
  purgeAndPromote,
  releaseSlot,
} from "./gate-logic.ts";

const MAX = 20;
const TTL = 25_000;

describe("presence gate claim", () => {
  it("fills to 20 then queues the 21st at position 1", () => {
    const state = createGateState();
    const now = 1_000_000;

    for (let i = 0; i < MAX; i++) {
      const r = claimSlot(state, `u${i}`, now, MAX, TTL);
      assert.equal(r.status, "ok");
      assert.equal(r.active, i + 1);
    }

    const queued = claimSlot(state, "waiter", now, MAX, TTL);
    assert.equal(queued.status, "queued");
    assert.equal(queued.position, 1);
    assert.equal(queued.active, MAX);

    const again = claimSlot(state, "waiter", now + 100, MAX, TTL);
    assert.equal(again.status, "queued");
    assert.equal(again.position, 1);
  });

  it("release promotes the next cookie from the FIFO", () => {
    const state = createGateState();
    const now = 2_000_000;

    for (let i = 0; i < MAX; i++) {
      claimSlot(state, `u${i}`, now, MAX, TTL);
    }
    claimSlot(state, "next-up", now, MAX, TTL);
    claimSlot(state, "behind", now, MAX, TTL);

    const before = getGateStatus(state, "next-up", now, MAX, TTL);
    assert.equal(before.self, "queued");
    assert.equal(before.position, 1);

    releaseSlot(state, "u0", now, MAX, TTL);

    const after = getGateStatus(state, "next-up", now, MAX, TTL);
    assert.equal(after.self, "active");
    assert.equal(after.position, null);

    const behind = getGateStatus(state, "behind", now, MAX, TTL);
    assert.equal(behind.self, "queued");
    assert.equal(behind.position, 1);
  });

  it("leave-queue removes a waiter without freeing or stealing a slot", () => {
    const state = createGateState();
    const now = 3_000_000;

    for (let i = 0; i < MAX; i++) {
      claimSlot(state, `u${i}`, now, MAX, TTL);
    }
    claimSlot(state, "offline-me", now, MAX, TTL);
    claimSlot(state, "still-waiting", now, MAX, TTL);

    assert.equal(state.active.size, MAX);
    assert.equal(state.queue.length, 2);

    leaveQueue(state, "offline-me");

    assert.equal(state.active.size, MAX);
    assert.equal(state.queue.length, 1);
    assert.equal(state.queue[0], "still-waiting");
    assert.equal(state.active.has("offline-me"), false);

    const status = getGateStatus(state, "still-waiting", now, MAX, TTL);
    assert.equal(status.position, 1);
  });

  it("expired tickets free slots and promote the queue head", () => {
    const state = createGateState();
    const now = 4_000_000;

    for (let i = 0; i < MAX; i++) {
      claimSlot(state, `u${i}`, now, MAX, TTL);
    }
    claimSlot(state, "promoted", now, MAX, TTL);

    // Expire one active ticket.
    state.active.set("u5", now - 1);
    purgeAndPromote(state, now + 1, MAX, TTL);

    assert.equal(state.active.has("u5"), false);
    assert.equal(state.active.has("promoted"), true);
    assert.equal(state.queue.includes("promoted"), false);
  });

  it("refresh claim extends TTL for an already-active visitor", () => {
    const state = createGateState();
    const now = 5_000_000;
    const first = claimSlot(state, "me", now, MAX, TTL);
    assert.equal(first.status, "ok");
    const second = claimSlot(state, "me", now + 5_000, MAX, TTL);
    assert.equal(second.status, "ok");
    assert.equal(second.expiresAt, now + 5_000 + TTL);
    assert.equal(state.active.size, 1);
  });
});
