import { z } from "zod";

/**
 * Schema for the landing page hero section
 */
export const landingHeroDataSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string(),
  ctaLink: z.string(),
});

export type LandingHeroData = z.infer<typeof landingHeroDataSchema>;

/**
 * Schema for landing page content
 */
export const landingPageSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  hero: landingHeroDataSchema,
});

export type LandingPageData = z.infer<typeof landingPageSchema>;

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
