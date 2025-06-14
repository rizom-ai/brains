import { z } from "zod";
import { baseEntitySchema } from "@brains/types";

/**
 * Schema for site content entities
 * These store AI-generated or user-edited content for the website
 */
export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),

  // Which page this content is for (e.g., "landing", "about")
  page: z.string(),

  // Which section of the page (e.g., "hero", "features")
  section: z.string(),

  // Environment this content belongs to
  environment: z.enum(["preview", "production"]),

  // Promotion metadata
  promotionMetadata: z
    .object({
      promotedAt: z.string().optional(),
      promotedBy: z.string().optional(),
      promotedFrom: z.string().optional(), // Entity ID of the preview version
    })
    .optional(),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
