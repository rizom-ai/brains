import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";
import { skillFrontmatterSchema } from "../schemas/skill";

const skillDerivationResultSchema = z.object({
  skills: z.array(skillFrontmatterSchema),
});

export type SkillDerivationResult = z.infer<typeof skillDerivationResultSchema>;

export const skillDerivationTemplate = createTemplate<SkillDerivationResult>({
  name: "agent-discovery:skill-derivation",
  description: "Derive skills from topic titles and brain capabilities",
  dataSourceId: "shell:ai-content",
  schema: skillDerivationResultSchema,
  basePrompt: `You are analyzing a brain's content to identify its capabilities.

Given the brain's knowledge domains and tool capabilities, identify its
distinct skills. Each skill combines what the brain knows with what it can do.

For each skill, provide:
- name: focused title (max 50 chars, single concept)
- description: one action-oriented sentence
- tags: 3-5 searchable keywords
- examples: 2-3 example prompts a user might send

Return 3-12 skills as a JSON object with a "skills" array.`,
  requiredPermission: "public",
});
