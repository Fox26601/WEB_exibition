import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, type CatalogKind } from "@/lib/catalog";
import { liveCatalogView } from "@/lib/live-catalog-view";
import { verifyPreviewToken } from "@/lib/preview-token";

export async function GET(req: NextRequest) {
  const kindParam = req.nextUrl.searchParams.get("catalog") || "live";
  const kind: CatalogKind = kindParam === "draft" ? "draft" : "live";
  const token = req.nextUrl.searchParams.get("token");

  if (kind === "draft") {
    const session = await requireAdmin();
    const okToken = await verifyPreviewToken(token);
    if (!session && !okToken) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const catalog = await loadCatalog(kind);
  // Live: strip unpublished artworks + their wall/floor placements so Unpublish
  // + Publish catalog actually clears them from the exhibition wall.
  const payload = kind === "live" ? liveCatalogView(catalog) : catalog;

  return NextResponse.json(payload, {
    headers: {
      // Live layout must refresh soon after Publish; long SWR left visitors on stale rooms.
      "Cache-Control":
        kind === "live"
          ? "public, max-age=0, s-maxage=5, stale-while-revalidate=15"
          : "private, no-store",
    },
  });
}
