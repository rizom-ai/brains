import { z } from "zod";
import { landingHeroDataSchema } from "../hero/schema";
import { featuresSectionSchema } from "../features/schema";
import { ctaSectionSchema } from "../cta/schema";

/**
 * Schema for complete landing page data
 * This combines all the section schemas for Astro's content collection
 */
export const landingPageSchema = z.object({
  title: z.string(),
  tagline: z.string(),
  hero: landingHeroDataSchema,
  features: featuresSectionSchema,
  cta: ctaSectionSchema,
});

export type LandingPageData = z.infer<typeof landingPageSchema>;
