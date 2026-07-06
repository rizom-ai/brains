import { baseEntitySchema } from "@brains/plugins";
import { z } from "@brains/utils/zod-v4";
import { SKILL_ENTITY_TYPE } from "../lib/constants";

type SkillFrontmatterSchema = z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  examples: z.ZodArray<z.ZodString>;
}>;

/**
 * Skill frontmatter schema.
 * Same shape as the A2A SkillData contract so the interface can read skill
 * metadata directly.
 */
export const skillFrontmatterSchema: SkillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/**
 * Skill metadata — stored in DB for Agent Card integration.
 * Same shape as SkillData so the A2A interface can read it directly.
 */
export const skillMetadataSchema: SkillFrontmatterSchema =
  skillFrontmatterSchema;

export type SkillMetadata = z.infer<typeof skillMetadataSchema>;

/**
 * Skill entity schema.
 */
export const skillEntitySchema: ReturnType<
  typeof baseEntitySchema.extend<{
    entityType: z.ZodLiteral<typeof SKILL_ENTITY_TYPE>;
    metadata: SkillFrontmatterSchema;
  }>
> = baseEntitySchema.extend({
  entityType: z.literal(SKILL_ENTITY_TYPE),
  metadata: skillMetadataSchema,
});

export type SkillEntity = z.infer<typeof skillEntitySchema>;
