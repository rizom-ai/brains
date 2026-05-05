import type { EntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import { AgentAdapter } from "../adapters/agent-adapter";
import { agentFrontmatterSchema, agentStatusSchema } from "../schemas/agent";
import type { AgentEntity } from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import { AGENT_ENTITY_TYPE, SKILL_ENTITY_TYPE } from "./constants";
import {
  buildAgentRows,
  buildSkillFilters,
  buildSkillRows,
} from "./agent-network-rows";

const agentAdapter = new AgentAdapter();

const agentKindSchema = agentFrontmatterSchema.shape.kind;

export const AGENT_NETWORK_KINDS = ["all", ...agentKindSchema.options] as const;

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
export type AgentNetworkAgentRow = z.infer<typeof agentNetworkAgentRowSchema>;
export type AgentNetworkSkillRow = z.infer<typeof agentNetworkSkillRowSchema>;
export type AgentNetworkTagFilter = z.infer<typeof agentNetworkTagFilterSchema>;
export type AgentNetworkWidgetData = z.infer<
  typeof agentNetworkWidgetDataSchema
>;

export async function buildAgentNetworkWidgetData(
  context: EntityPluginContext,
): Promise<AgentNetworkWidgetData> {
  const [agents, skills] = await Promise.all([
    context.entityService.listEntities<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
    }),
    context.entityService.listEntities<SkillEntity>({
      entityType: SKILL_ENTITY_TYPE,
    }),
  ]);

  const parsedAgents = agents.map((entity) => ({
    entity,
    ...agentAdapter.parseEntity(entity),
  }));
  const agentRows = buildAgentRows(parsedAgents);
  const skillRows = buildSkillRows(skills, parsedAgents);

  return {
    counts: {
      agents: agentRows.length,
      skills: skillRows.length,
    },
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
