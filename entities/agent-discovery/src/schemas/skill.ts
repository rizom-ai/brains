import { baseEntitySchema } from "@brains/plugins";
import { z } from "./main-zod";
import { SKILL_ENTITY_TYPE } from "../lib/constants";

/**
 * Skill frontmatter schema — local main-Zod duplicate of the A2A SkillData
 * shape. The public A2A parser schema is Zod 4-owned; this durable entity
 * schema stays on the main-Zod entity boundary until that boundary migrates as
 * a whole.
 */
export const skillFrontmatterSchema = z.object({
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
export const skillMetadataSchema = skillFrontmatterSchema;

export type SkillMetadata = z.infer<typeof skillMetadataSchema>;

/**
 * Skill entity schema.
 */
export const skillEntitySchema = baseEntitySchema.extend({
  entityType: z.literal(SKILL_ENTITY_TYPE),
  metadata: skillMetadataSchema,
});

export type SkillEntity = z.infer<typeof skillEntitySchema>;
