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
 * Generated content metadata schema
 */
export const generatedContentMetadataSchema = z.object({
  prompt: z.string(),
  context: z.unknown(),
  generatedAt: z.string(),
  generatedBy: z.string(),
  regenerated: z.boolean(),
  previousVersionId: z.string().optional(),
  // Validation fields for human-editable content
  validationStatus: z.enum(["valid", "invalid"]),
  validationErrors: z.array(z.object({
    message: z.string()
  })).optional(),
  lastValidData: z.record(z.unknown()).optional(),
});

/**
 * Generated content entity schema
 */
export const generatedContentSchema = baseEntitySchema.extend({
  entityType: z.literal("generated-content"),
  contentType: z.string(),
  data: z.record(z.unknown()),
  metadata: generatedContentMetadataSchema,
});

/**
 * Generated content types
 */
export type GeneratedContentMetadata = z.infer<
  typeof generatedContentMetadataSchema
>;
export type GeneratedContent = z.infer<typeof generatedContentSchema>;
