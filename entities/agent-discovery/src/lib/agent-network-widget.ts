import type { EntityPluginContext } from "@brains/plugins";
import { AgentAdapter } from "../adapters/agent-adapter";
import { agentEntitySchema } from "../schemas/agent";
import { skillEntitySchema } from "../schemas/skill";
import { AGENT_ENTITY_TYPE, SKILL_ENTITY_TYPE } from "./constants";
import type {
  AgentNetworkAgentRow,
  AgentNetworkSkillRow,
  AgentNetworkWidgetData,
} from "./agent-network-schema";
import {
  buildAgentRows,
  buildSkillFilters,
  buildSkillRows,
  type ParsedAgentForNetwork,
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

const agentAdapter: AgentAdapter = new AgentAdapter();
export async function buildAgentNetworkWidgetData(
  context: EntityPluginContext,
): Promise<AgentNetworkWidgetData> {
  const [agents, skills] = await Promise.all([
    context.entityService.listEntities(
      {
        entityType: AGENT_ENTITY_TYPE,
      },
      agentEntitySchema,
    ),
    context.entityService.listEntities(
      {
        entityType: SKILL_ENTITY_TYPE,
      },
      skillEntitySchema,
    ),
  ]);

  const parsedAgents: ParsedAgentForNetwork[] = agents.map((entity) => ({
    entity,
    ...agentAdapter.parseEntity(entity),
  }));
  const agentRows: AgentNetworkAgentRow[] = buildAgentRows(parsedAgents);
  const skillRows: AgentNetworkSkillRow[] = buildSkillRows(
    skills,
    parsedAgents,
  );

  return {
    counts: {
      agents: agentRows.length,
      skills: skillRows.length,
    },
    agents: {
      all: agentRows,
      person: agentRows.filter((agent) => agent.kind === "person"),
      team: agentRows.filter((agent) => agent.kind === "team"),
      organization: agentRows.filter((agent) => agent.kind === "organization"),
    },
    skillFilters: buildSkillFilters(skillRows),
    skills: skillRows,
  };
}
