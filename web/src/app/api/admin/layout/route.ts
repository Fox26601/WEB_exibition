import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { loadCatalog, saveDraftLayout } from "@/lib/catalog";
import { catalogsDifferForPublish } from "@/lib/catalog";
import type { GalleryLayout } from "@/lib/catalog-types";

const vecSchema = z.object({ x: z.number(), z: z.number() });

const layoutSchema = z.object({
  rooms: z.array(
    z.object({
      id: z.string(),
      shape: z.enum(["triangle", "square", "pentagon", "hexagon"]),
      transform: z.object({
        x: z.number(),
        z: z.number(),
        rotation: z.number(),
        scaleX: z.number(),
        scaleZ: z.number(),
      }),
      vertices: z.array(vecSchema).optional(),
    }),
  ),
  connections: z.array(
    z.object({
      roomA: z.string(),
      roomB: z.string(),
      edgeA: z.number(),
      edgeB: z.number(),
      doorwayWidth: z.number(),
    }),
  ),
  placements: z.array(
    z.object({
      artworkId: z.string(),
      kind: z.enum(["painting", "sculpture"]),
      roomId: z.string(),
      wallEdgeIndex: z.number().optional(),
      tAlongEdge: z.number().optional(),
      floorX: z.number().optional(),
      floorZ: z.number().optional(),
      yaw: z.number(),
      frameId: z.enum(["thin", "wood", "metal", "ornate", "none"]),
    }),
  ),
});

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [draft, live] = await Promise.all([
    loadCatalog("draft"),
    loadCatalog("live"),
  ]);
  return NextResponse.json({
    layout: draft.layout,
    draftUpdatedAt: draft.updatedAt,
    liveUpdatedAt: live.updatedAt,
    liveVersion: live.version,
    dirty: catalogsDifferForPublish(draft, live),
  });
}

export async function PUT(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = layoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const layout = parsed.data as GalleryLayout;
  const catalog = await saveDraftLayout(layout);
  const live = await loadCatalog("live");
  return NextResponse.json({
    catalog,
    layout: catalog.layout,
    dirty: catalogsDifferForPublish(catalog, live),
    message: "Draft layout saved",
  });
}
