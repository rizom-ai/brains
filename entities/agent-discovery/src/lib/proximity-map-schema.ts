import { z } from "@brains/utils/zod";
import { agentFrontmatterSchema, agentStatusSchema } from "../schemas/agent";

const agentKindSchema: typeof agentFrontmatterSchema.shape.kind =
  agentFrontmatterSchema.shape.kind;

export const proximityMapCenterSchema: z.ZodObject<{
  kind: z.ZodEnum<{ identity: "identity"; centroid: "centroid" }>;
}> = z.object({
  kind: z.enum(["identity", "centroid"]),
});

export type ProximityMapCenter = z.output<typeof proximityMapCenterSchema>;

export const proximityMapNodeSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  kind: typeof agentKindSchema;
  status: typeof agentStatusSchema;
  tags: z.ZodArray<z.ZodString>;
  distance: z.ZodNumber;
  bearing: z.ZodNumber;
}> = z.object({
  id: z.string(),
  name: z.string(),
  kind: agentKindSchema,
  status: agentStatusSchema,
  tags: z.array(z.string()),
  /** Normalized cosine distance in the zero-to-one radial range. */
  distance: z.number().min(0).max(1),
  /** Semantic bearing in degrees, normalized to [0, 360). */
  bearing: z.number().min(0).lt(360),
});

export type ProximityMapNode = z.output<typeof proximityMapNodeSchema>;

const proximityMapClusterLinkSchema: z.ZodObject<{
  sourceId: z.ZodString;
  targetId: z.ZodString;
}> = z.object({
  sourceId: z.string(),
  targetId: z.string(),
});

export type ProximityMapClusterLink = z.output<
  typeof proximityMapClusterLinkSchema
>;

export const proximityMapClusterSchema: z.ZodObject<{
  label: z.ZodString;
  memberIds: z.ZodArray<z.ZodString>;
  links: z.ZodArray<typeof proximityMapClusterLinkSchema>;
}> = z.object({
  label: z.string(),
  memberIds: z.array(z.string()).min(2),
  links: z.array(proximityMapClusterLinkSchema).min(1),
});

export type ProximityMapCluster = z.output<typeof proximityMapClusterSchema>;

export const proximityMapDistanceRangeSchema: z.ZodObject<{
  min: z.ZodNumber;
  max: z.ZodNumber;
}> = z.object({
  min: z.number().min(0),
  max: z.number().min(0),
});

export type ProximityMapDistanceRange = z.output<
  typeof proximityMapDistanceRangeSchema
>;

type ProximityMapCopySchema = z.ZodObject<{
  kicker: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  headingLead: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  headingAccent: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  lede: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ctaLabel: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  ctaHref: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}>;

/**
 * Authored hero copy for the map's site section. Every field is optional: the
 * datasource never supplies these, and the site template falls back to its own
 * defaults when a field is absent. They live flat on the payload so the
 * content-overlay merge (site sections) can splice authored markdown over the
 * live map data; this subset builds the section's overlayFormatter so the hero
 * copy is edited as a normal markdown section while map data stays live.
 */
export const proximityMapCopySchema: ProximityMapCopySchema = z.object({
  /** Eyebrow above the heading. */
  kicker: z.string().nullable().default(null),
  /** Heading, plain lead-in before the accented tail. */
  headingLead: z.string().nullable().default(null),
  /** Heading tail, rendered in the accent (italic). */
  headingAccent: z.string().nullable().default(null),
  /** Standfirst under the heading. */
  lede: z.string().nullable().default(null),
  /** Call-to-action label. */
  ctaLabel: z.string().nullable().default(null),
  /** Call-to-action href. */
  ctaHref: z.string().nullable().default(null),
});

export type ProximityMapCopy = z.output<typeof proximityMapCopySchema>;

/**
 * A second-order agent reported by a peer's directory. `viaIds` reference
 * active nodes on the same map — the introducers whose roots reach it.
 */
export const proximityMapSightingSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  viaIds: z.ZodArray<z.ZodString>;
  tags: z.ZodArray<z.ZodString>;
  distance: z.ZodNumber;
  bearing: z.ZodNumber;
}> = z.object({
  id: z.string(),
  name: z.string(),
  viaIds: z.array(z.string()).min(1),
  tags: z.array(z.string()),
  /** Normalized cosine distance in the zero-to-one radial range. */
  distance: z.number().min(0).max(1),
  /** Semantic bearing in degrees, normalized to [0, 360). */
  bearing: z.number().min(0).lt(360),
});

export type ProximityMapSighting = z.output<typeof proximityMapSightingSchema>;

export const proximityMapDataSchema: z.ZodObject<
  {
    center: typeof proximityMapCenterSchema;
    nodes: z.ZodArray<typeof proximityMapNodeSchema>;
    clusters: z.ZodArray<typeof proximityMapClusterSchema>;
    sightings: z.ZodArray<typeof proximityMapSightingSchema>;
    distanceRange: typeof proximityMapDistanceRangeSchema;
    pendingCount: z.ZodNumber;
  } & ProximityMapCopySchema["shape"]
> = z.object({
  center: proximityMapCenterSchema,
  nodes: z.array(proximityMapNodeSchema),
  clusters: z.array(proximityMapClusterSchema),
  sightings: z.array(proximityMapSightingSchema),
  distanceRange: proximityMapDistanceRangeSchema,
  pendingCount: z.number().int().min(0),
  ...proximityMapCopySchema.shape,
});

export type ProximityMapData = z.output<typeof proximityMapDataSchema>;

/**
 * The map's center is the brain itself, never the person reading it: the
 * public brain card renders this map to anonymous visitors. Both the widget
 * and the declarative dashboard block label the center through this helper so
 * the two renderers cannot drift apart.
 */
export function proximityCenterLabel(center: ProximityMapCenter): string {
  return center.kind === "identity" ? "Brain identity" : "Centroid";
}
