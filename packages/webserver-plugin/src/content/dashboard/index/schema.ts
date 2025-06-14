import { z } from "zod";

/**
 * Schema for dashboard page content
 */
export const dashboardSchema = z.object({
  title: z.string(),
  description: z.string(),
  stats: z.object({
    entityCount: z.number(),
    entityTypeCount: z.number(),
    lastUpdated: z.string(),
  }),
  recentEntities: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      created: z.string(),
    }),
  ),
});

export type DashboardData = z.infer<typeof dashboardSchema>;