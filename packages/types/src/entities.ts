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
 * Generated content entity schema
 * Generated content is immutable - to edit, promote to another entity type
 */
export const generatedContentSchema = baseEntitySchema.extend({
  entityType: z.literal("generated-content"),
  contentType: z.string(),
  generatedBy: z.string(),
});

/**
 * Generated content types
 */
export type GeneratedContent = z.infer<typeof generatedContentSchema>;
