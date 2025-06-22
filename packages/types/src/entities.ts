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
 * Search result type
 */
export interface SearchResult {
  entity: BaseEntity;
  score: number;
  excerpt: string;
  highlights: string[];
}

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

/**
 * Site content entity type
 */
export type SiteContent = z.infer<typeof siteContentSchema>;
