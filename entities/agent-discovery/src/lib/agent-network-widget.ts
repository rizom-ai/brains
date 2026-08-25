import type { JobEntityAccess } from "@brains/sdk/entities";
import { parseAgentEntity } from "./agent-content";
import type { AgentEntity } from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
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

export async function buildAgentNetworkWidgetData(
  entities: JobEntityAccess,
): Promise<AgentNetworkWidgetData> {
  const [agents, skills] = await Promise.all([
    entities.listEntities<AgentEntity>({
      entityType: AGENT_ENTITY_TYPE,
    }),
    entities.listEntities<SkillEntity>({
      entityType: SKILL_ENTITY_TYPE,
    }),
  ]);

  const parsedAgents: ParsedAgentForNetwork[] = agents.map((entity) => ({
    entity,
    ...parseAgentEntity(entity),
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
