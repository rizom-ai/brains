import { z } from "@brains/utils";

/**
 * Schema for landing page metadata (title and tagline)
 */
export const landingMetadataSchema = z.object({
  title: z.string(),
  tagline: z.string(),
});

export type LandingMetadata = z.infer<typeof landingMetadataSchema>;
