import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, saveDraftLayout } from "@/lib/catalog";
import { catalogsDifferForPublish } from "@/lib/catalog";
import { normalizeLayout } from "@/lib/catalog-types";
import { parseLayoutApiBody } from "@/lib/layout-api-schema";

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [draft, live] = await Promise.all([
    loadCatalog("draft"),
    loadCatalog("live"),
  ]);
  return NextResponse.json(
    {
      layout: draft.layout,
      draftUpdatedAt: draft.updatedAt,
      liveUpdatedAt: live.updatedAt,
      liveVersion: live.version,
      dirty: catalogsDifferForPublish(draft, live),
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = parseLayoutApiBody(body);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const layout = normalizeLayout(parsed.layout);
  try {
    const catalog = await saveDraftLayout(layout);
    const live = await loadCatalog("live");
    return NextResponse.json({
      catalog,
      layout: catalog.layout,
      dirty: catalogsDifferForPublish(catalog, live),
      message: "Draft layout saved",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Save failed";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
