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

  return `You are analyzing a brain's content to identify its high-level capabilities.

${sections.join("\n\n")}

CONSOLIDATION RULES (critical):
- Combine related knowledge domains into broader skills
- There should be FEWER skills than knowledge domains
- "Event Sourcing" + "Software Architecture" → one skill about software design
- "Urban Sensing" + "Distributed Systems" → one skill about technical infrastructure
- Never map topics 1:1 to skills — that defeats the purpose

For each skill, write an action-oriented description of what the brain
can DO (not just what it knows). Use verbs: "Create...", "Analyze...",
"Design...", "Write about...".

Return 2-5 skills. Each skill needs:
- name: broad capability (max 50 chars, NOT a topic title copy)
- description: one action-oriented sentence
- tags: 3-5 keywords spanning multiple topics
- examples: 2-3 concrete user prompts`;
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
  options?: { replaceAll?: boolean },
): Promise<{ created: number; deleted: number; skipped: number }> {
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
    return { created: 0, deleted: 0, skipped: 0 };
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
      templateName: "skill:skill-derivation",
    });
    skills = result.skills;
  } catch (error) {
    logger.error("Skill derivation LLM call failed", {
      error: getErrorMessage(error),
    });
    return { created: 0, deleted: 0, skipped: 0 };
  }

  // Replace-all mode: delete existing skills first (manual extract)
  // Incremental mode: create by slug, skip existing (preserves user edits)
  let deleted = 0;
  if (options?.replaceAll) {
    const existingSkills = await context.entityService.listEntities("skill");
    for (const skill of existingSkills) {
      await context.entityService.deleteEntity("skill", skill.id);
      deleted++;
    }
  }

  // Create skills — skip existing by slug
  let created = 0;
  let skipped = 0;
  for (const skill of skills) {
    const id = generateIdFromText(skill.name);

    if (!options?.replaceAll) {
      const existing = await context.entityService.getEntity("skill", id);
      if (existing) {
        skipped++;
        continue;
      }
    }

    const content = adapter.createSkillContent(skill);

    try {
      await context.entityService.createEntity({
        id,
        entityType: "skill",
        content,
        metadata: skill,
      });
      created++;
    } catch (error) {
      logger.error("Failed to create skill entity", {
        name: skill.name,
        error: getErrorMessage(error),
      });
    }
  }

  logger.info("Skill derivation complete", { created, deleted, skipped });
  return { created, deleted, skipped };
}
