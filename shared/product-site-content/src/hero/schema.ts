import { z } from "@brains/utils/zod-v4";

/**
 * Schema for the landing page hero section
 */
export const landingHeroDataSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string(),
  ctaLink: z.string(),
});

export type LandingHeroData = z.output<typeof landingHeroDataSchema>;
