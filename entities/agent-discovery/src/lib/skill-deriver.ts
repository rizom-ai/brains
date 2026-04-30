import {
  reconcileDerivedEntities,
  type EntityPluginContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { generateIdFromText, getErrorMessage } from "@brains/utils";
import { SkillAdapter } from "../adapters/skill-adapter";
import type { SkillEntity, SkillFrontmatter } from "../schemas/skill";
import {
  collectTagVocabulary,
  formatVocabularyForPrompt,
  type TagVocabularyEntry,
} from "./tag-vocabulary";

export interface SkillDeriverInput {
  topicTitles: string[];
  toolDescriptions: string[];
  tagVocabulary: TagVocabularyEntry[];
}

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

  const primer = formatVocabularyForPrompt(input.tagVocabulary);
  if (primer) sections.push(primer);

  return `You are analyzing a brain's content to identify its high-level capabilities.

${sections.join("\n\n")}

CONSOLIDATION RULES (critical):
- Combine related knowledge domains into broader skills
- There should be FEWER skills than knowledge domains
- "Event Sourcing" + "Software Architecture" → one skill about software design
- "Urban Sensing" + "Distributed Systems" → one skill about technical infrastructure
- Never map topics 1:1 to skills — that defeats the purpose

TAGGING RULES (critical):
- Reuse an existing tag when one fits
- Propose a new tag only when nothing in the existing vocabulary fits
- Keep tags short, reusable, and lower-friction across multiple skills

For each skill, write an action-oriented description of what the brain
can DO (not just what it knows). Use verbs: "Create...", "Analyze...",
"Design...", "Write about...".

Return 2-5 skills. Each skill needs:
- name: broad capability (max 50 chars, NOT a topic title copy)
- description: one action-oriented sentence
- tags: 3-5 keywords spanning multiple topics
- examples: 2-3 concrete user prompts`;
}

export async function deriveSkills(
  context: EntityPluginContext,
  logger: Logger,
  options?: { replaceAll?: boolean },
): Promise<{
  created: number;
  updated: number;
  deleted: number;
  skipped: number;
}> {
  const adapter = new SkillAdapter();

  const topics = await context.entityService.listEntities("topic");
  const topicTitles = topics
    .map((t) => {
      const meta = t.metadata as Record<string, unknown>;
      const name = meta["name"];
      if (typeof name === "string") return name;
      const titleMatch = t.content.match(/^title:\s*(.+)$/m);
      return titleMatch?.[1]?.trim() ?? t.id;
    })
    .filter(Boolean);

  if (topicTitles.length === 0) {
    logger.info("No topics found — skipping skill derivation");
    return { created: 0, updated: 0, deleted: 0, skipped: 0 };
  }

  // Tool descriptions could be added here when EntityPluginContext
  // exposes MCP service access. For now, topics alone are enough —
  // the LLM infers capabilities from knowledge domains.
  const prompt = buildSkillPrompt({
    topicTitles,
    toolDescriptions: [],
    tagVocabulary: await collectTagVocabulary(context),
  });

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
    return { created: 0, updated: 0, deleted: 0, skipped: 0 };
  }

  const desired = new Map(
    skills.map((skill) => [generateIdFromText(skill.name), skill] as const),
  );
  if (desired.size !== skills.length) {
    logger.warn("Dropped skills with duplicate slug ids", {
      received: skills.length,
      unique: desired.size,
    });
  }
  const { created, updated, deleted, skipped } = await reconcileDerivedEntities<
    SkillFrontmatter,
    SkillEntity
  >({
    context,
    targetType: "skill",
    desired: desired.values(),
    getId: (skill) => generateIdFromText(skill.name),
    toEntityInput: (skill, id) => ({
      id,
      entityType: "skill",
      content: adapter.createSkillContent(skill),
      metadata: skill,
    }),
    equals: (existing, skill) =>
      Bun.deepEquals(existing.metadata, skill) &&
      existing.content === adapter.createSkillContent(skill),
    deleteStale: options?.replaceAll ?? false,
    deleteConcurrency: 1,
    logger,
  });

  logger.info("Skill derivation complete", {
    created,
    updated,
    deleted,
    skipped,
  });
  return { created, updated, deleted, skipped };
}
