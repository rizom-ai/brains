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

export interface ProximityMapData {
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

export const proximityMapDataSchema: z.ZodType<ProximityMapData> = z.object({
  center: proximityMapCenterSchema,
  nodes: z.array(proximityMapNodeSchema),
  clusters: z.array(proximityMapClusterSchema),
  distanceRange: proximityMapDistanceRangeSchema,
  pendingCount: z.number().int().min(0),
});
