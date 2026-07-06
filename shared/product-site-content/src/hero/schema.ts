import { z } from "@brains/utils/zod";

/**
 * Schema for the landing page hero section
 */
export interface LandingHeroData {
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaLink: string;
}

export const landingHeroDataSchema: z.ZodType<LandingHeroData> = z.object({
  headline: z.string(),
  subheadline: z.string(),
  ctaText: z.string(),
  ctaLink: z.string(),
});
