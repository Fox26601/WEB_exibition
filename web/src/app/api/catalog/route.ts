import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, publicArtworks, type CatalogKind } from "@/lib/catalog";
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
  const payload =
    kind === "live"
      ? (() => {
          const arts = publicArtworks(catalog);
          const pubIds = new Set(arts.map((a) => a.id));
          const layout = catalog.layout
            ? {
                ...catalog.layout,
                placements: (catalog.layout.placements || []).filter((p) =>
                  pubIds.has(p.artworkId),
                ),
              }
            : catalog.layout;
          return { ...catalog, artworks: arts, layout };
        })()
      : catalog;

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control":
        kind === "live"
          ? "public, s-maxage=30, stale-while-revalidate=60"
          : "private, no-store",
    },
  });
}
