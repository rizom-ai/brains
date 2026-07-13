import { z } from "@brains/utils/zod";
import type { AgentFrontmatter, AgentStatus } from "../schemas/agent";
import { agentFrontmatterSchema, agentStatusSchema } from "../schemas/agent";

export interface ProximityMapCenter {
  kind: "identity" | "centroid";
}

export interface ProximityMapNode {
  id: string;
  name: string;
  kind: AgentFrontmatter["kind"];
  status: AgentStatus;
  tags: string[];
  /** Normalized cosine distance in the zero-to-one radial range. */
  distance: number;
  /** Semantic bearing in degrees, normalized to [0, 360). */
  bearing: number;
}

export interface ProximityMapClusterLink {
  sourceId: string;
  targetId: string;
}

export interface ProximityMapCluster {
  label: string;
  memberIds: string[];
  links: ProximityMapClusterLink[];
}

export interface ProximityMapDistanceRange {
  min: number;
  max: number;
}

/**
 * Authored hero copy for the map's site section. Every field is optional: the
 * datasource never supplies these, and the site template falls back to its own
 * defaults when a field is absent. They live flat on the payload so the
 * content-overlay merge (site sections) can splice authored markdown over the
 * live map data — see proximityMapCopySchema / the section's overlayFormatter.
 */
export interface ProximityMapCopy {
  /** Eyebrow above the heading. */
  kicker?: string | undefined;
  /** Heading, plain lead-in before the accented tail. */
  headingLead?: string | undefined;
  /** Heading tail, rendered in the accent (italic). */
  headingAccent?: string | undefined;
  /** Standfirst under the heading. */
  lede?: string | undefined;
  /** Call-to-action label. */
  ctaLabel?: string | undefined;
  /** Call-to-action href. */
  ctaHref?: string | undefined;
}

export interface ProximityMapData extends ProximityMapCopy {
  center: ProximityMapCenter;
  nodes: ProximityMapNode[];
  clusters: ProximityMapCluster[];
  distanceRange: ProximityMapDistanceRange;
  pendingCount: number;
}

const agentKindSchema: typeof agentFrontmatterSchema.shape.kind =
  agentFrontmatterSchema.shape.kind;

export const proximityMapCenterSchema: z.ZodType<ProximityMapCenter> = z.object(
  {
    kind: z.enum(["identity", "centroid"]),
  },
);

export const proximityMapNodeSchema: z.ZodType<ProximityMapNode> = z.object({
  id: z.string(),
  name: z.string(),
  kind: agentKindSchema,
  status: agentStatusSchema,
  tags: z.array(z.string()),
  distance: z.number().min(0).max(1),
  bearing: z.number().min(0).lt(360),
});

const proximityMapClusterLinkSchema: z.ZodType<ProximityMapClusterLink> =
  z.object({
    sourceId: z.string(),
    targetId: z.string(),
  });

export const proximityMapClusterSchema: z.ZodType<ProximityMapCluster> =
  z.object({
    label: z.string(),
    memberIds: z.array(z.string()).min(2),
    links: z.array(proximityMapClusterLinkSchema).min(1),
  });

export const proximityMapDistanceRangeSchema: z.ZodType<ProximityMapDistanceRange> =
  z.object({
    min: z.number().min(0),
    max: z.number().min(0),
  });

/**
 * The authored-copy subset, used to build the section's overlayFormatter so
 * the hero copy is edited as a normal markdown section while map data stays
 * live. Kept in sync with ProximityMapCopy.
 */
export const proximityMapCopySchema: z.ZodType<ProximityMapCopy> = z.object({
  kicker: z.string().optional(),
  headingLead: z.string().optional(),
  headingAccent: z.string().optional(),
  lede: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
});

export const proximityMapDataSchema: z.ZodType<ProximityMapData> = z.object({
  center: proximityMapCenterSchema,
  nodes: z.array(proximityMapNodeSchema),
  clusters: z.array(proximityMapClusterSchema),
  distanceRange: proximityMapDistanceRangeSchema,
  pendingCount: z.number().int().min(0),
  kicker: z.string().optional(),
  headingLead: z.string().optional(),
  headingAccent: z.string().optional(),
  lede: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaHref: z.string().optional(),
});
