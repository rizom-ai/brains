import { z } from "@brains/utils";
import { baseEntitySchema } from "@brains/plugins";

/**
 * Skill frontmatter schema — describes a knowledge domain capability.
 */
export const skillFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export type SkillFrontmatter = z.infer<typeof skillFrontmatterSchema>;

/**
 * Skill metadata — subset for DB queries.
 */
export const skillMetadataSchema = skillFrontmatterSchema.pick({
  name: true,
});

export type SkillMetadata = z.infer<typeof skillMetadataSchema>;

/**
 * Skill entity schema.
 */
export const skillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal("skill"),
  metadata: skillMetadataSchema,
});

export type SkillEntity = z.infer<typeof skillEntitySchema>;
