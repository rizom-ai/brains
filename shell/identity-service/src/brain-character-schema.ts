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

export interface CommunicationPreferences {
  audience?: string | undefined;
  tone?: string | undefined;
}

export type CommunicationPreferencesSchema = z.ZodObject<{
  audience: z.ZodOptional<z.ZodString>;
  tone: z.ZodOptional<z.ZodString>;
}>;

export const communicationPreferencesSchema: CommunicationPreferencesSchema =
  z.object({
    audience: z
      .string()
      .optional()
      .describe("Default intended readership for generated content"),
    tone: z
      .string()
      .optional()
      .describe("Default tone for generated content and responses"),
  });

export interface BrainCharacter {
  name: string;
  role: string;
  purpose: string;
  values: string[];
  communicationPreferences?: CommunicationPreferences | undefined;
}

export type BrainCharacterBodySchema = z.ZodObject<{
  name: z.ZodString;
  role: z.ZodString;
  purpose: z.ZodString;
  values: z.ZodArray<z.ZodString>;
  communicationPreferences: z.ZodOptional<CommunicationPreferencesSchema>;
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
  communicationPreferences: communicationPreferencesSchema
    .optional()
    .describe(
      "Default communication behavior, overridable per task or channel",
    ),
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
