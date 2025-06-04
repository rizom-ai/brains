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

  // The actual content data as structured object
  data: z.record(z.unknown()),
});

export type SiteContent = z.infer<typeof siteContentSchema>;
