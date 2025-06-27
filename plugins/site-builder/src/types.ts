import { z } from "zod";
import { baseEntitySchema } from "@brains/types";

/**
 * Base site content schema - shared between preview and production
 */
const baseSiteSchema = baseEntitySchema.extend({
  page: z.string(),
  section: z.string(),
  template: z.string().optional(),
  content: z.string(),
});

/**
 * Site content preview entity schema
 */
export const siteContentPreviewSchema = baseSiteSchema.extend({
  entityType: z.literal("site-content-preview"),
});

/**
 * Site content production entity schema
 */
export const siteContentProductionSchema = baseSiteSchema.extend({
  entityType: z.literal("site-content-production"),
});

export type SiteContentPreview = z.infer<typeof siteContentPreviewSchema>;
export type SiteContentProduction = z.infer<typeof siteContentProductionSchema>;