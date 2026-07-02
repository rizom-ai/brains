import { z } from "@brains/utils/zod-v4";

/**
 * Schema for feature card
 */
export interface FeatureCard {
  icon: string;
  title: string;
  description: string;
}

export const featureCardSchema: z.ZodType<FeatureCard> = z.object({
  icon: z.string(), // SVG path or icon name
  title: z.string(),
  description: z.string(),
});

/**
 * Schema for features section
 */
export interface FeaturesSection {
  label: string;
  headline: string;
  description: string;
  features: FeatureCard[];
}

export const featuresSectionSchema: z.ZodType<FeaturesSection> = z.object({
  label: z.string(),
  headline: z.string(),
  description: z.string(),
  features: z.array(featureCardSchema).min(1).max(4), // Reduced max to match prompt
});
