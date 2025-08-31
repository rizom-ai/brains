import { z } from "@brains/utils";

/**
 * Schema for entity statistics
 */
export const EntityStatSchema = z.object({
  type: z.string(),
  count: z.number(),
});

/**
 * Schema for recent entity
 */
export const RecentEntitySchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  created: z.string(),
});

/**
 * Schema for build information
 */
export const BuildInfoSchema = z.object({
  timestamp: z.string(),
  version: z.string(),
});

/**
 * Schema for dashboard data
 */
export const DashboardDataSchema = z.object({
  entityStats: z.array(EntityStatSchema),
  recentEntities: z.array(RecentEntitySchema),
  buildInfo: BuildInfoSchema,
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;
export type EntityStat = z.infer<typeof EntityStatSchema>;
export type RecentEntity = z.infer<typeof RecentEntitySchema>;
export type BuildInfo = z.infer<typeof BuildInfoSchema>;
