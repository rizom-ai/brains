import { z } from "@brains/utils/zod-v4";

/**
 * Schema for landing page metadata (title and tagline)
 */
export const landingMetadataSchema = z.object({
  title: z.string(),
  tagline: z.string(),
});

export type LandingMetadata = z.output<typeof landingMetadataSchema>;
