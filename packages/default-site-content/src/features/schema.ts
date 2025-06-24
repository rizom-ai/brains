import { z } from "zod";

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
