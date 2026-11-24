import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog } from "@/lib/catalog";
import { normalizeLayout } from "@/lib/catalog-types";

export default async function AdminDashboard() {
  const session = await requireAdmin();
  if (!session) redirect("/admin/login");

  const [live, draft] = await Promise.all([
    loadCatalog("live"),
    loadCatalog("draft"),
  ]);

  const publishedCount = draft.artworks.filter((a) => a.published).length;
  const draftLayout = normalizeLayout(draft.layout);
  const placedCount = draftLayout.placements.length;
  const roomCount = draftLayout.rooms.length;

  return (
    <div>
      <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-bold">
        Dashboard
      </h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Draft artworks" value={String(draft.artworks.length)} />
        <Stat label="Published in draft" value={String(publishedCount)} />
        <Stat label="Live version" value={`v${live.version}`} />
      </div>
      <p className="mt-6 text-sm text-[var(--paper-dim)]">
        Draft layout:{" "}
        <strong className="text-[var(--paper)]">
          {roomCount} room{roomCount === 1 ? "" : "s"}
        </strong>
        ,{" "}
        <strong className="text-[var(--paper)]">
          {placedCount} placement{placedCount === 1 ? "" : "s"}
        </strong>
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/artworks" className="btn btn-solid">
          Manage artworks
        </Link>
        <Link href="/admin/settings" className="btn">
          Site settings
        </Link>
        <Link href="/admin/preview" className="btn">
          Preview space
        </Link>
        <Link href="/exhibition" className="btn btn-ghost" target="_blank">
          Open live exhibition
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-[#1a1612] p-5">
      <p className="mb-2 text-xs uppercase tracking-[0.14em] text-[var(--paper-dim)]">
        {label}
      </p>
      <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--amber-bright)]">
        {value}
      </p>
    </div>
  );
}
