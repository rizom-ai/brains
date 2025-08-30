import { z } from "zod";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Site content entity schema - single schema for all site content
 */
export const siteContentSchema = baseEntitySchema.extend({
  entityType: z.literal("site-content"),
  routeId: z.string(),
  sectionId: z.string(),
  template: z.string().optional(),
  content: z.string(),
});

export type SiteContent = z.infer<typeof siteContentSchema>;

// Legacy type aliases for backward compatibility during migration
// TODO: Remove these after migration is complete
export type SiteContentPreview = SiteContent;
export type SiteContentProduction = SiteContent;
export const siteContentPreviewSchema = siteContentSchema;
export const siteContentProductionSchema = siteContentSchema;
