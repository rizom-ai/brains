import { firstSentence } from "@brains/utils/string-utils";
import type {
  AgentEntity,
  AgentFrontmatter,
  AgentSkill,
} from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import type {
  AgentNetworkAgentRow,
  AgentNetworkSkillRow,
  AgentNetworkTagFilter,
} from "./agent-network-schema";
import { normalizeTags } from "./tag-vocabulary";

export interface ParsedAgentForNetwork {
  entity: AgentEntity;
  frontmatter: AgentFrontmatter;
  body: {
    about: string;
    skills: AgentSkill[];
    notes: string;
  };
}

function formatAgentDisplayName(frontmatter: AgentFrontmatter): string {
  return frontmatter.name === frontmatter.brainName
    ? frontmatter.name
    : `${frontmatter.name} · ${frontmatter.brainName}`;
}

function describeAgent(frontmatter: AgentFrontmatter, about: string): string {
  return (
    firstSentence(about) ??
    [frontmatter.kind, frontmatter.organization].filter(Boolean).join(" · ")
  );
}

function compareAgentRows(
  a: AgentNetworkAgentRow,
  b: AgentNetworkAgentRow,
): number {
  const tagDiff = b.tags.length - a.tags.length;
  if (tagDiff !== 0) return tagDiff;

  const discoveredDiff =
    new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime();
  if (discoveredDiff !== 0) return discoveredDiff;

  return a.name.localeCompare(b.name);
}

function compareSkillRows(
  a: AgentNetworkSkillRow,
  b: AgentNetworkSkillRow,
): number {
  if (a.sourceType !== b.sourceType) {
    return a.sourceType === "brain" ? -1 : 1;
  }

  const nameDiff = a.name.localeCompare(b.name);
  if (nameDiff !== 0) return nameDiff;

  return a.sourceLabel.localeCompare(b.sourceLabel);
}

export function buildAgentRows(
  parsedAgents: ParsedAgentForNetwork[],
): AgentNetworkAgentRow[] {
  return parsedAgents
    .map(
      ({ entity, frontmatter, body }) =>
        ({
          id: entity.id,
          name: formatAgentDisplayName(frontmatter),
          description: describeAgent(frontmatter, body.about),
          tags: normalizeTags(body.skills.flatMap((skill) => skill.tags)),
          kind: frontmatter.kind,
          status: frontmatter.status,
          discoveredAt: frontmatter.discoveredAt,
        }) satisfies AgentNetworkAgentRow,
    )
    .sort(compareAgentRows);
}

export function buildSkillRows(
  skills: SkillEntity[],
  parsedAgents: ParsedAgentForNetwork[],
): AgentNetworkSkillRow[] {
  const rows: AgentNetworkSkillRow[] = [];
  const seen = new Set<string>();

  const pushSkillRow = (row: AgentNetworkSkillRow): void => {
    const key = `${row.sourceType}:${row.sourceLabel}:${row.name.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };

  for (const skill of skills) {
    pushSkillRow({
      id: `brain:${skill.id}`,
      name: skill.metadata.name,
      tags: normalizeTags(skill.metadata.tags),
      sourceLabel: "brain",
      sourceType: "brain",
    });
  }

  for (const { entity, frontmatter, body } of parsedAgents) {
    if (frontmatter.status === "archived") continue;

    body.skills.forEach((skill, index) => {
      pushSkillRow({
        id: `${entity.id}:${index}`,
        name: skill.name,
        tags: normalizeTags(skill.tags),
        sourceLabel: frontmatter.brainName,
        sourceType: "agent",
      });
    });
  }

  return rows.sort(compareSkillRows);
}

export function selectSkillFilterValues(
  tags: readonly string[],
  filters: readonly AgentNetworkTagFilter[],
): string[] {
  const selectable = new Set(filters.map((filter) => filter.tag));
  return tags.filter((tag) => selectable.has(tag));
}

export function buildSkillFilters(
  skills: AgentNetworkSkillRow[],
): AgentNetworkTagFilter[] {
  const stats = new Map<
    string,
    { count: number; hasBrain: boolean; sources: Set<string> }
  >();

  for (const skill of skills) {
    const uniqueTags = new Set(skill.tags);
    const sourceKey =
      skill.sourceType === "brain" ? "brain" : `agent:${skill.sourceLabel}`;

    for (const tag of uniqueTags) {
      const current = stats.get(tag) ?? {
        count: 0,
        hasBrain: false,
        sources: new Set<string>(),
      };
      current.count += 1;
      current.sources.add(sourceKey);
      if (skill.sourceType === "brain") current.hasBrain = true;
      stats.set(tag, current);
    }
  }

  return Array.from(stats.entries())
    .map(([tag, info]) => ({ tag, ...info }))
    .sort((a, b) => {
      const priority = (entry: typeof a): number =>
        entry.sources.size > 1 ? 0 : entry.hasBrain ? 1 : 2;
      const priorityDiff = priority(a) - priority(b);
      if (priorityDiff !== 0) return priorityDiff;
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    })
    .map((entry): AgentNetworkTagFilter => ({
      tag: entry.tag,
      count: entry.count,
      ...(entry.hasBrain && entry.sources.size === 1 ? { variant: "gap" } : {}),
    }));
}
