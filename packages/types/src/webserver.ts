import { z } from "zod";

/**
 * Schema for landing page data used by webserver plugin and templates
 */
export const landingPageSchema = z.object({
  title: z.string(),
  description: z.string(),
  stats: z.object({
    noteCount: z.number(),
    tagCount: z.number(),
    lastUpdated: z.string(),
  }),
  recentNotes: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      created: z.string(),
    }),
  ),
});

export type LandingPageData = z.infer<typeof landingPageSchema>;