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
 * Schema for feature card
 */
export const featureCardSchema = z.object({
  icon: z.string(), // SVG path or icon name
  title: z.string(),
  description: z.string(),
});

export type FeatureCard = z.infer<typeof featureCardSchema>;

/**
 * Schema for features section
 */
export const featuresSectionSchema = z.object({
  label: z.string(),
  headline: z.string(),
  description: z.string(),
  features: z.array(featureCardSchema).min(1).max(4), // Reduced max to match prompt
});

export type FeaturesSection = z.infer<typeof featuresSectionSchema>;

/**
 * Schema for CTA section
 */
export const ctaSectionSchema = z.object({
  headline: z.string(),
  description: z.string(),
  primaryButton: z.object({
    text: z.string(),
    link: z.string(),
  }),
  secondaryButton: z
    .object({
      text: z.string(),
      link: z.string(),
    })
    .optional(),
});

export type CTASection = z.infer<typeof ctaSectionSchema>;

/**
 * Schema for landing page content (using references)
 */
export const landingPageReferenceSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  heroId: z.string(),
  featuresId: z.string(),
  ctaId: z.string(),
});

export type LandingPageReferenceData = z.infer<
  typeof landingPageReferenceSchema
>;

/**
 * Schema for complete landing page data (after resolution)
 */
export const landingPageSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  hero: landingHeroDataSchema,
  features: featuresSectionSchema,
  cta: ctaSectionSchema,
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