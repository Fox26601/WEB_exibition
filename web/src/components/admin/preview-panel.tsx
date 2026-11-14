"use client";

import { useEffect, useState } from "react";
import type { Catalog } from "@/lib/catalog-types";
import { RoomSchematic } from "./room-schematic";

export function PreviewPanel() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catRes, tokRes] = await Promise.all([
          fetch("/api/catalog?catalog=draft"),
          fetch("/api/admin/preview-token", { method: "POST" }),
        ]);
        if (!catRes.ok || !tokRes.ok) throw new Error("Failed to load preview");
        const cat = await catRes.json();
        const tok = await tokRes.json();
        if (!cancelled) {
          setCatalog(cat);
          setToken(tok.token);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const published = catalog?.artworks.filter((a) => a.published).length ?? 0;
  const iframeSrc = token
    ? `/exhibition?catalog=draft&token=${encodeURIComponent(token)}`
    : "";

  return (
    <div>
      <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-bold">
        Preview
      </h1>
      {error ? <p className="text-[#e08a7a]">{error}</p> : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <RoomSchematic count={published} />
        <div className="border border-[var(--line)] bg-[#1a1612]">
          <div className="border-b border-[var(--line)] px-4 py-2 text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
            Exhibition draft iframe
          </div>
          {iframeSrc ? (
            <iframe
              title="Draft exhibition"
              src={iframeSrc}
              className="h-[420px] w-full bg-black"
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center text-[var(--paper-dim)]">
              Loading…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
