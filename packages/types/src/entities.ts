import { z } from "zod";

/**
 * Base entity schema that all entities must extend
 */
export const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string().datetime(),
  updated: z.string().datetime(),
});

/**
 * Base entity type
 */
export type BaseEntity = z.infer<typeof baseEntitySchema>;

/**
 * Entity input type for creation - allows partial entities with optional system fields
 */
export type EntityInput<T extends BaseEntity> = Omit<
  T,
  "id" | "created" | "updated"
> & {
  id?: string;
  created?: string;
  updated?: string;
};

/**
 * Search result type
 */
export interface SearchResult {
  entity: BaseEntity;
  score: number;
  excerpt: string;
  highlights: string[];
}

/**
 * Shared schema for all site content entities
 */
const baseSiteContentSchema = baseEntitySchema.extend({
  // Which page this content is for (e.g., "landing", "about")
  page: z.string(),

  // Which section of the page (e.g., "hero", "features")
  section: z.string(),
});

/**
 * Schema for preview site content entities
 * These store draft content being worked on before publication
 */
export const siteContentPreviewSchema = baseSiteContentSchema.extend({
  entityType: z.literal("site-content-preview"),
});

/**
 * Schema for production site content entities
 * These store live content that's been promoted from preview
 */
export const siteContentProductionSchema = baseSiteContentSchema.extend({
  entityType: z.literal("site-content-production"),

  // Future enhancement: Add promotion metadata when audit trails are needed
  // promotionMetadata: z.object({
  //   promotedAt: z.string(),
  //   promotedBy: z.string().optional(),
  // }).optional(),
});

/**
 * Site content entity types
 */
export type SiteContentPreview = z.infer<typeof siteContentPreviewSchema>;
export type SiteContentProduction = z.infer<typeof siteContentProductionSchema>;
