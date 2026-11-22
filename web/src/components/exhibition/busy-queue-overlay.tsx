"use client";

type Props = {
  position: number;
  onEnterOffline: () => void;
};

/**
 * Full-screen busy overlay — only shown while queued for a Photon slot.
 * Enter offline leaves the FIFO and plays the exhibition solo.
 */
export function BusyQueueOverlay({ position, onEnterOffline }: Props) {
  return (
    <div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="presence-queue-title"
    >
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-[0.7rem] uppercase tracking-[0.18em] text-white/50">
          Exhibition online
        </p>
        <h2
          id="presence-queue-title"
          className="mb-3 font-[family-name:var(--font-display)] text-3xl font-semibold text-white"
        >
          Server is full
        </h2>
        <p className="mb-8 text-[var(--paper-dim)]">
          You are number{" "}
          <span className="font-semibold text-white">{position}</span> in
          line. Stay here to join automatically, or enter offline alone.
        </p>
        <button
          type="button"
          className="btn btn-solid"
          onClick={onEnterOffline}
        >
          Enter offline
        </button>
      </div>
    </div>
  );
}
