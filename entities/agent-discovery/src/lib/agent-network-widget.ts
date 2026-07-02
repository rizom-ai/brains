import type { EntityPluginContext } from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { AgentEntity } from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import { AGENT_ENTITY_TYPE, SKILL_ENTITY_TYPE } from "./constants";
import type { AgentNetworkWidgetData } from "./agent-network-schema";
import {
  buildAgentRows,
  buildSkillFilters,
  buildSkillRows,
} from "./agent-network-rows";

export {
  AGENT_NETWORK_KINDS,
  agentNetworkAgentRowSchema,
  agentNetworkSkillRowSchema,
  agentNetworkTagFilterSchema,
  agentNetworkWidgetDataSchema,
} from "./agent-network-schema";
export type {
  AgentNetworkKind,
  AgentNetworkAgentRow,
  AgentNetworkSkillRow,
  AgentNetworkTagFilter,
  AgentNetworkWidgetData,
} from "./agent-network-schema";

const agentAdapter = new AgentAdapter();

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
