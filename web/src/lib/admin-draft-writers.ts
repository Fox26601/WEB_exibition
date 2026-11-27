/**
 * Cross-page / cross-tab draft writer flush before Publish catalog.
 * Settings (700ms) and Layout (400ms) register flush callbacks so any
 * Publish CTA can drain pending autosaves before promoting draft → live.
 */

type FlushFn = () => Promise<void>;

const writers = new Map<string, FlushFn>();
const CHANNEL = "webgalerey-admin-draft-flush";
/** Wait for other tabs that receive the BroadcastChannel ping. */
const REMOTE_FLUSH_MS = 450;

export function registerAdminDraftWriter(
  id: string,
  flush: FlushFn,
): () => void {
  writers.set(id, flush);
  return () => {
    if (writers.get(id) === flush) writers.delete(id);
  };
}

async function flushLocalWriters(): Promise<void> {
  const fns = [...writers.values()];
  await Promise.all(
    fns.map(async (fn) => {
      try {
        await fn();
      } catch {
        /* individual writer surfaces its own error */
      }
    }),
  );
}

function pingRemoteTabs(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: "flush" });
    ch.close();
  } catch {
    /* ignore */
  }
}

let listening = false;

/** Call once from client admin shells so other tabs flush on Publish. */
export function ensureAdminDraftFlushListener(): void {
  if (listening || typeof window === "undefined") return;
  if (typeof BroadcastChannel === "undefined") return;
  listening = true;
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = (ev) => {
      if (ev?.data?.type === "flush") {
        void flushLocalWriters();
      }
    };
  } catch {
    listening = false;
  }
}

/** Flush local pending writers, ping other tabs, wait briefly for remotes. */
export async function flushAllAdminDraftWriters(): Promise<void> {
  ensureAdminDraftFlushListener();
  pingRemoteTabs();
  await flushLocalWriters();
  await new Promise((r) => setTimeout(r, REMOTE_FLUSH_MS));
  await flushLocalWriters();
}

/** Count placed artworks that are still draft (`published: false`). */
export function countPlacedUnpublished(
  artworks: Array<{ id: string; published?: boolean }>,
  placements: Array<{ artworkId: string }>,
): number {
  const byId = new Map(artworks.map((a) => [a.id, a]));
  let n = 0;
  for (const p of placements) {
    const art = byId.get(p.artworkId);
    if (art && art.published === false) n += 1;
  }
  return n;
}

export function confirmPublishWithPlacedDrafts(
  placedUnpublished: number,
  baseMessage = "Publish draft catalog to live?",
): boolean {
  if (placedUnpublished <= 0) {
    return confirm(baseMessage);
  }
  return confirm(
    `${baseMessage}\n\n${placedUnpublished} placed artwork${
      placedUnpublished === 1 ? " is" : "s are"
    } still draft (Hide from live). ` +
      `They will not appear on the live wall until you mark them Show on live and publish again. Continue?`,
  );
}
