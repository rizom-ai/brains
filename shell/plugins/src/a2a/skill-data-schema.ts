import { z } from "@brains/utils/zod-v4";

/**
 * Skill data for Agent Card integration.
 * Defined here as the shared durable entity contract — entities compose this
 * schema into their main-Zod entity/frontmatter schemas while the agent-card
 * parser itself can migrate independently.
 */
export const skillDataSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export type SkillData = z.output<typeof skillDataSchema>;
