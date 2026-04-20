import type { EntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import { SwotAdapter } from "../adapters/swot-adapter";
import {
  agentFrontmatterSchema,
  agentStatusSchema,
  type AgentFrontmatter,
  type AgentEntity,
} from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import type { SwotEntity } from "../schemas/swot";
import { swotFrontmatterSchema } from "../schemas/swot";
import { normalizeTags } from "./tag-vocabulary";

const agentAdapter = new AgentAdapter();
const swotAdapter = new SwotAdapter();

const agentKindSchema = agentFrontmatterSchema.shape.kind;

export const AGENT_NETWORK_KINDS = ["all", ...agentKindSchema.options] as const;

export const agentNetworkOverviewSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("generating"),
  }),
  swotFrontmatterSchema.extend({
    status: z.literal("ready"),
  }),
]);

export const agentNetworkAgentRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  kind: agentKindSchema,
  status: agentStatusSchema,
  discoveredAt: z.string(),
});

export const agentNetworkSkillRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  sourceLabel: z.string(),
  sourceType: z.enum(["brain", "agent"]),
});

export const agentNetworkTagFilterSchema = z.object({
  tag: z.string(),
  count: z.number(),
  variant: z.enum(["gap"]).optional(),
});

export const agentNetworkWidgetDataSchema = z.object({
  counts: z.object({
    agents: z.number(),
    skills: z.number(),
  }),
  overview: agentNetworkOverviewSchema,
  agents: z.object({
    all: z.array(agentNetworkAgentRowSchema),
    professional: z.array(agentNetworkAgentRowSchema),
    team: z.array(agentNetworkAgentRowSchema),
    collective: z.array(agentNetworkAgentRowSchema),
  }),
  skillFilters: z.array(agentNetworkTagFilterSchema),
  skills: z.array(agentNetworkSkillRowSchema),
});

export type AgentNetworkKind = (typeof AGENT_NETWORK_KINDS)[number];
export type AgentNetworkOverview = z.infer<typeof agentNetworkOverviewSchema>;
export type AgentNetworkAgentRow = z.infer<typeof agentNetworkAgentRowSchema>;
export type AgentNetworkSkillRow = z.infer<typeof agentNetworkSkillRowSchema>;
export type AgentNetworkTagFilter = z.infer<typeof agentNetworkTagFilterSchema>;
export type AgentNetworkWidgetData = z.infer<
  typeof agentNetworkWidgetDataSchema
>;

function firstSentence(text: string): string | undefined {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(.*?[.!?])(?:\s|$)/);
  if (match?.[1]) return match[1];
  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}…`;
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

function buildSkillFilters(
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

  const sorted = Array.from(stats.entries())
    .map(([tag, info]) => ({ tag, ...info }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.tag.localeCompare(b.tag);
    });

  const filters: AgentNetworkTagFilter[] = [];
  const seen = new Set<string>();

  for (const entry of sorted
    .filter((entry) => entry.sources.size > 1)
    .slice(0, 5)) {
    filters.push({ tag: entry.tag, count: entry.count });
    seen.add(entry.tag);
  }

  for (const entry of sorted.filter(
    (entry) => entry.hasBrain && entry.sources.size === 1,
  )) {
    if (seen.has(entry.tag)) continue;
    filters.push({ tag: entry.tag, count: entry.count, variant: "gap" });
  }

  return filters;
}

function buildOverview(swot: SwotEntity | null): AgentNetworkOverview {
  if (!swot) {
    return { status: "generating" };
  }

  const { frontmatter } = swotAdapter.parseSwotContent(swot.content);
  return {
    status: "ready",
    ...frontmatter,
  };
}

export async function buildAgentNetworkWidgetData(
  context: EntityPluginContext,
): Promise<AgentNetworkWidgetData> {
  const [agents, skills, swot] = await Promise.all([
    context.entityService.listEntities<AgentEntity>("agent"),
    context.entityService.listEntities<SkillEntity>("skill"),
    context.entityService.getEntity<SwotEntity>("swot", "swot"),
  ]);

  const parsedAgents = agents.map((entity) => ({
    entity,
    ...agentAdapter.parseEntity(entity),
  }));

  const agentRows = parsedAgents
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

  const skillRows: AgentNetworkSkillRow[] = [];
  const seenSkills = new Set<string>();

  const pushSkillRow = (row: AgentNetworkSkillRow): void => {
    const key = `${row.sourceType}:${row.sourceLabel}:${row.name.toLowerCase()}`;
    if (seenSkills.has(key)) return;
    seenSkills.add(key);
    skillRows.push(row);
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

  skillRows.sort(compareSkillRows);

  return {
    counts: {
      agents: agentRows.length,
      skills: skillRows.length,
    },
    overview: buildOverview(swot),
    agents: {
      all: agentRows,
      professional: agentRows.filter((agent) => agent.kind === "professional"),
      team: agentRows.filter((agent) => agent.kind === "team"),
      collective: agentRows.filter((agent) => agent.kind === "collective"),
    },
    skillFilters: buildSkillFilters(skillRows),
    skills: skillRows,
  };
}
