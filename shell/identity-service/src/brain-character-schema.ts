import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Brain character entity schema
 * Character data (role, purpose, values) is stored in content field as structured markdown
 */
export const brainCharacterSchema = baseEntitySchema.extend({
  id: z.literal("brain-character"),
  entityType: z.literal("brain-character"),
});

/**
 * Brain character entity type derived from schema
 */
export type BrainCharacterEntity = z.infer<typeof brainCharacterSchema>;

/**
 * Brain character body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const brainCharacterBodySchema = z.object({
  name: z.string().describe("The brain's friendly display name"),
  role: z.string().describe("The brain's primary role"),
  purpose: z.string().describe("The brain's purpose and goals"),
  values: z.array(z.string()).describe("Core values that guide behavior"),
});

/**
 * Brain character body type
 */
export type BrainCharacter = z.infer<typeof brainCharacterBodySchema>;

/**
 * Brain character frontmatter schema for CMS editing
 * Same shape as body schema — all character data is structured fields
 */
export const brainCharacterFrontmatterSchema = brainCharacterBodySchema;
