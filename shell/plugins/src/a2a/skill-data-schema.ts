import { z } from "@brains/utils/zod";

/**
 * Skill data for Agent Card integration.
 * Defined here as the shared Zod 4 contract used by agent-card parsing and
 * durable skill entity/frontmatter schemas.
 */
export const skillDataSchema: z.ZodObject<{
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  examples: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  examples: z.array(z.string()),
});

export type SkillData = z.output<typeof skillDataSchema>;
