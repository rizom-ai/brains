import { z } from "@brains/utils";
import { baseEntitySchema, skillDataSchema } from "@brains/plugins";
import type { SkillData } from "@brains/plugins";

/**
 * Skill frontmatter schema — adapts SkillData (from plugins) into an entity.
 */
export const skillFrontmatterSchema = skillDataSchema;

export type SkillFrontmatter = SkillData;

/**
 * Skill metadata — stored in DB for Agent Card integration.
 * Same shape as SkillData so the A2A interface can read it directly.
 */
export const skillMetadataSchema = skillDataSchema;

export type SkillMetadata = z.infer<typeof skillMetadataSchema>;

/**
 * Skill entity schema.
 */
export const skillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: skillMetadataSchema,
});

export type SkillEntity = z.infer<typeof skillEntitySchema>;
