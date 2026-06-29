import { z } from "@brains/utils/zod-v4";

/**
 * Skill data for Agent Card integration.
 * Defined here as the shared Zod 4 contract used by agent-card parsing and
 * durable skill entity/frontmatter schemas.
 */
export const skillDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export type SkillData = z.output<typeof skillDataSchema>;
