import { z } from "zod";
import {
  MAX_WALL_HEIGHT_T,
  MIN_WALL_HEIGHT_T,
  type GalleryLayout,
} from "./catalog-types";
import { normalizeHexColor } from "./room-surface-colors";

const vecSchema = z.object({ x: z.number(), z: z.number() });

/** Optional CSS hex `#RGB` / `#RRGGBB` — normalized to `#rrggbb` on parse. */
export const hexColorSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined) return undefined;
    const normalized = normalizeHexColor(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Expected CSS hex color #RGB or #RRGGBB",
      });
      return z.NEVER;
    }
    return normalized;
  });

/** Zod body for PUT /api/admin/layout — keep in sync with GalleryLayout. */
export const layoutApiSchema = z.object({
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
      floorColor: hexColorSchema,
      wallColor: hexColorSchema,
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
      /** Normalized hang height (world Y = wallHeightT × room height). */
      wallHeightT: z
        .number()
        .min(MIN_WALL_HEIGHT_T)
        .max(MAX_WALL_HEIGHT_T)
        .optional(),
      floorX: z.number().optional(),
      floorZ: z.number().optional(),
      yaw: z.number(),
      frameId: z.enum(["thin", "wood", "metal", "ornate", "none"]),
    }),
  ),
  entrance: z
    .object({
      x: z.number(),
      z: z.number(),
      rotation: z.number(),
    })
    .optional(),
});

export type LayoutApiInput = z.infer<typeof layoutApiSchema>;

export function parseLayoutApiBody(body: unknown): {
  ok: true;
  layout: GalleryLayout;
} | {
  ok: false;
  error: z.ZodError;
} {
  const parsed = layoutApiSchema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, error: parsed.error };
  }
  return { ok: true, layout: parsed.data as GalleryLayout };
}
