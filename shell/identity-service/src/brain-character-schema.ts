import { z } from "@brains/utils/zod";
import { baseEntitySchema } from "@brains/entity-service";

/**
 * Brain character entity schema
 * Character data (role, purpose, values) is stored in content field as structured markdown
 */
export const brainCharacterSchema: ReturnType<
  typeof baseEntitySchema.extend<{
    id: z.ZodLiteral<"brain-character">;
    entityType: z.ZodLiteral<"brain-character">;
  }>
> = baseEntitySchema.extend({
  id: z.literal("brain-character"),
  entityType: z.literal("brain-character"),
});

/**
 * Brain character entity type derived from schema
 */
export type BrainCharacterEntity = z.infer<typeof brainCharacterSchema>;

export interface BrainCharacter {
  name: string;
  role: string;
  purpose: string;
  values: string[];
}

export type BrainCharacterBodySchema = z.ZodObject<{
  name: z.ZodString;
  role: z.ZodString;
  purpose: z.ZodString;
  values: z.ZodArray<z.ZodString>;
}>;

/**
 * Brain character body schema - structure of content within the markdown
 * (Not stored as separate entity fields - parsed from content)
 */
export const brainCharacterBodySchema: BrainCharacterBodySchema = z.object({
  name: z.string().describe("The brain's friendly display name"),
  role: z.string().describe("The brain's primary role"),
  purpose: z.string().describe("The brain's purpose and goals"),
  values: z.array(z.string()).describe("Core values that guide behavior"),
});

/**
 * Brain character body type
 */
export type BrainCharacterFrontmatterSchema = BrainCharacterBodySchema;

/**
 * Brain character frontmatter schema for CMS editing
 * Same shape as body schema — all character data is structured fields
 */
export const brainCharacterFrontmatterSchema: BrainCharacterFrontmatterSchema =
  brainCharacterBodySchema;
