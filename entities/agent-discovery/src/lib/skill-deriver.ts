import type { EntityPluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { generateIdFromText, getErrorMessage } from "@brains/utils";
import { SkillAdapter } from "../adapters/skill-adapter";
import type { SkillFrontmatter } from "../schemas/skill";

export interface SkillDeriverInput {
  topicTitles: string[];
  toolDescriptions: string[];
}

/**
 * Build the prompt for skill derivation.
 * Combines topic titles (knowledge domains) with tool descriptions (capabilities)
 * to produce action-oriented skill descriptions.
 */
export function buildSkillPrompt(input: SkillDeriverInput): string {
  const sections: string[] = [];

  if (input.topicTitles.length > 0) {
    sections.push(
      `The brain's knowledge domains (from content analysis):\n${input.topicTitles.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  if (input.toolDescriptions.length > 0) {
    sections.push(
      `The brain has these capabilities:\n${input.toolDescriptions.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  return `You are analyzing a brain's content to identify its capabilities.

${sections.join("\n\n")}

Identify the brain's distinct skills. For each skill, write an
action-oriented description combining what the brain knows with
what it can do. Return 3-12 skills.

Each skill needs:
- name: focused title (max 50 chars)
- description: one sentence, action-oriented
- tags: 3-5 keywords
- examples: 2-3 example prompts a user might send`;
}

/**
 * Derive skills from topics and tools.
 *
 * Collects topic titles and tool descriptions, makes one LLM call,
 * deletes all existing skills, creates new ones. Replace-all strategy.
 */
export async function deriveSkills(
  context: EntityPluginContext,
  logger: Logger,
): Promise<{ created: number; deleted: number }> {
  const adapter = new SkillAdapter();

  // Collect topic titles
  const topics = await context.entityService.listEntities("topic");
  const topicTitles = topics
    .map((t) => {
      const meta = t.metadata as Record<string, unknown>;
      const name = meta["name"];
      if (typeof name === "string") return name;
      // Fall back to parsing content for title
      const titleMatch = t.content.match(/^title:\s*(.+)$/m);
      return titleMatch?.[1]?.trim() ?? t.id;
    })
    .filter(Boolean);

  if (topicTitles.length === 0) {
    logger.info("No topics found — skipping skill derivation");
    return { created: 0, deleted: 0 };
  }

  // Tool descriptions could be added here when EntityPluginContext
  // exposes MCP service access. For now, topics alone are enough —
  // the LLM infers capabilities from knowledge domains.
  const prompt = buildSkillPrompt({ topicTitles, toolDescriptions: [] });

  // One LLM call
  let skills: SkillFrontmatter[];
  try {
    const result = await context.ai.generate<{
      skills: SkillFrontmatter[];
    }>({
      prompt,
      templateName: "agent-discovery:skill-derivation",
    });
    skills = result.skills;
  } catch (error) {
    logger.error("Skill derivation LLM call failed", {
      error: getErrorMessage(error),
    });
    return { created: 0, deleted: 0 };
  }

  // Delete all existing skills (replace-all)
  const existingSkills = await context.entityService.listEntities("skill");
  let deleted = 0;
  for (const skill of existingSkills) {
    await context.entityService.deleteEntity("skill", skill.id);
    deleted++;
  }

  // Create new skills
  let created = 0;
  for (const skill of skills) {
    const id = generateIdFromText(skill.name);
    const content = adapter.createSkillContent(skill);

    try {
      await context.entityService.createEntity({
        id,
        entityType: "skill",
        content,
        metadata: { name: skill.name },
      });
      created++;
    } catch (error) {
      logger.error("Failed to create skill entity", {
        name: skill.name,
        error: getErrorMessage(error),
      });
    }
  }

  logger.info("Skill derivation complete", { created, deleted });
  return { created, deleted };
}
