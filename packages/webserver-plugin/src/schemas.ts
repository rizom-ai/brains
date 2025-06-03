import { z } from "zod";

/**
 * Schema for landing page content
 */
export const landingPageSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  hero: z.object({
    headline: z.string(),
    subheadline: z.string(),
    ctaText: z.string(),
    ctaLink: z.string(),
  }),
});

export type LandingPageData = z.infer<typeof landingPageSchema>;

/**
 * Schema for dashboard page content
 */
export const dashboardSchema = z.object({
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

export type DashboardData = z.infer<typeof dashboardSchema>;
