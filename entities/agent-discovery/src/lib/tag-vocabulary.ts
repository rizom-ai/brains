import type { EntityPluginContext } from "@brains/plugins";
import type { AgentEntity } from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import { AgentAdapter } from "../adapters/agent-adapter";

const agentAdapter = new AgentAdapter();

export interface TagVocabularyEntry {
  tag: string;
  count: number;
}

export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of raw) {
    const value = normalizeTag(tag);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }

  return normalized;
}

function sortVocabulary(a: TagVocabularyEntry, b: TagVocabularyEntry): number {
  if (b.count !== a.count) return b.count - a.count;
  return a.tag.localeCompare(b.tag);
}

export async function collectTagVocabulary(
  context: EntityPluginContext,
  opts: { minCount?: number; topN?: number } = {},
): Promise<TagVocabularyEntry[]> {
  const minCount = opts.minCount ?? 1;
  const topN = opts.topN ?? 12;
  const counts = new Map<string, number>();

  const [skills, agents] = await Promise.all([
    context.entityService.listEntities<SkillEntity>("skill"),
    context.entityService.listEntities<AgentEntity>("agent"),
  ]);

  const bump = (tags: string[]): void => {
    for (const tag of normalizeTags(tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  };

  for (const skill of skills) bump(skill.metadata.tags);
  for (const agent of agents) {
    const body = agentAdapter.parseAgentContent(agent.content);
    bump(body.skills.flatMap((skill) => skill.tags));
  }

  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .filter((entry) => entry.count >= minCount)
    .sort(sortVocabulary)
    .slice(0, topN);
}

export function formatVocabularyForPrompt(vocab: TagVocabularyEntry[]): string {
  if (vocab.length === 0) return "";

  return [
    "Current agent-directory tag vocabulary (reuse existing tags where they fit; propose new only when nothing does):",
    ...vocab.map(({ tag, count }) => `- ${tag} (${count})`),
  ].join("\n");
}
