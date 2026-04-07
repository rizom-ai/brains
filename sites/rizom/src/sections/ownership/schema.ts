import { z } from "@brains/utils";

export const FeatureRowSchema = z.object({
  icon: z.string(),
  title: z.string(),
  body: z.string(),
});

export const OwnershipContentSchema = z.object({
  badge: z.string(),
  headline: z.string(),
  features: z.array(FeatureRowSchema).min(1),
});

export type FeatureRow = z.infer<typeof FeatureRowSchema>;
export type OwnershipContent = z.infer<typeof OwnershipContentSchema>;
