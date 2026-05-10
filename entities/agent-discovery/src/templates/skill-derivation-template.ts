import { createTemplate } from "@brains/plugins";
import { z } from "@brains/utils";
import { skillFrontmatterSchema } from "../schemas/skill";

const skillDerivationResultSchema = z.object({
  skills: z.array(skillFrontmatterSchema).max(8),
});

export type SkillDerivationResult = z.infer<typeof skillDerivationResultSchema>;

export const skillDerivationTemplate = createTemplate<SkillDerivationResult>({
  name: "skill:skill-derivation",
  description: "Derive skills from topic titles and brain capabilities",
  dataSourceId: "shell:ai-content",
  schema: skillDerivationResultSchema,
  useKnowledgeContext: true,
  basePrompt: `You are analyzing a brain's content to identify its high-level capabilities.

Given knowledge domains, CONSOLIDATE related topics into broader skills.
There should be FEWER skills than topics — combine related domains.

Each skill should describe what the brain can DO (action-oriented).

For each skill, provide:
- name: broad capability title (max 50 chars, NOT a topic copy)
- description: one action-oriented sentence
- tags: 3-5 keywords spanning multiple topics
- examples: 2-3 concrete user prompts

Return 4-8 skills as a JSON object with a "skills" array.`,
  requiredPermission: "public",
});
