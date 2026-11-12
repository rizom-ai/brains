import { parseAgentEntity } from "./agent-content";
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
import { type ContentVisibility } from "@brains/sdk/internal/service-runtime";
import type { AgentContext } from "./agent-context";

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
  context: Pick<AgentContext, "entityService">,
  visibilityScope: ContentVisibility,
): Promise<AgentNetworkWidgetData> {
  const [agents, skills] = await Promise.all([
    context.entityService.listEntities(
      {
        entityType: AGENT_ENTITY_TYPE,
        options: { filter: { visibilityScope } },
      },
      agentEntitySchema,
    ),
    context.entityService.listEntities(
      {
        entityType: SKILL_ENTITY_TYPE,
        options: { filter: { visibilityScope } },
      },
      skillEntitySchema,
    ),
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
