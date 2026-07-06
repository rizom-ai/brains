import { z } from "@brains/utils/zod";

/**
 * Schema for landing page metadata (title and tagline)
 */
export interface LandingMetadata {
  title: string;
  tagline: string;
}

export const landingMetadataSchema: z.ZodType<LandingMetadata> = z.object({
  title: z.string(),
  tagline: z.string(),
});
