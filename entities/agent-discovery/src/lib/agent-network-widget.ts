import type { EntityPluginContext } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { AgentAdapter } from "../adapters/agent-adapter";
import type { AgentEntity } from "../schemas/agent";
import type { SkillEntity } from "../schemas/skill";
import { AGENT_ENTITY_TYPE, SKILL_ENTITY_TYPE } from "./constants";
import {
  buildAgentRows,
  buildSkillFilters,
  buildSkillRows,
  type ParsedAgentForNetwork,
} from "./agent-network-rows";

const agentAdapter: AgentAdapter = new AgentAdapter();

type AgentKindSchema = z.ZodEnum<{
  professional: "professional";
  team: "team";
  collective: "collective";
}>;

const agentKindSchema: AgentKindSchema = z.enum([
  "professional",
  "team",
  "collective",
]);

type AgentNetworkStatusSchema = z.ZodEnum<{
  discovered: "discovered";
  approved: "approved";
}>;

const agentNetworkStatusSchema: AgentNetworkStatusSchema = z.enum([
  "discovered",
  "approved",
]);

export const AGENT_NETWORK_KINDS: readonly [
  "all",
  "professional",
  "team",
  "collective",
] = ["all", "professional", "team", "collective"] as const;

type AgentNetworkAgentRowSchema = z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  kind: AgentKindSchema;
  status: AgentNetworkStatusSchema;
  discoveredAt: z.ZodString;
}>;

export const agentNetworkAgentRowSchema: AgentNetworkAgentRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  kind: agentKindSchema,
  status: agentNetworkStatusSchema,
  discoveredAt: z.string(),
});

type AgentNetworkSkillRowSchema = z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  sourceLabel: z.ZodString;
  sourceType: z.ZodEnum<{ brain: "brain"; agent: "agent" }>;
}>;

export const agentNetworkSkillRowSchema: AgentNetworkSkillRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  sourceLabel: z.string(),
  sourceType: z.enum(["brain", "agent"]),
});

type AgentNetworkTagFilterSchema = z.ZodObject<{
  tag: z.ZodString;
  count: z.ZodNumber;
  variant: z.ZodOptional<z.ZodEnum<{ gap: "gap" }>>;
}>;

export const agentNetworkTagFilterSchema: AgentNetworkTagFilterSchema =
  z.object({
    tag: z.string(),
    count: z.number(),
    variant: z.enum(["gap"]).optional(),
  });

type AgentNetworkWidgetDataSchema = z.ZodObject<{
  counts: z.ZodObject<{
    agents: z.ZodNumber;
    skills: z.ZodNumber;
  }>;
  agents: z.ZodObject<{
    all: z.ZodArray<AgentNetworkAgentRowSchema>;
    professional: z.ZodArray<AgentNetworkAgentRowSchema>;
    team: z.ZodArray<AgentNetworkAgentRowSchema>;
    collective: z.ZodArray<AgentNetworkAgentRowSchema>;
  }>;
  skillFilters: z.ZodArray<AgentNetworkTagFilterSchema>;
  skills: z.ZodArray<AgentNetworkSkillRowSchema>;
}>;

export const agentNetworkWidgetDataSchema: AgentNetworkWidgetDataSchema =
  z.object({
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
export type AgentNetworkAgentRow = z.output<typeof agentNetworkAgentRowSchema>;
export type AgentNetworkSkillRow = z.output<typeof agentNetworkSkillRowSchema>;
export type AgentNetworkTagFilter = z.output<
  typeof agentNetworkTagFilterSchema
>;
export type AgentNetworkWidgetData = z.output<
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
      professional: agentRows.filter((agent) => agent.kind === "professional"),
      team: agentRows.filter((agent) => agent.kind === "team"),
      collective: agentRows.filter((agent) => agent.kind === "collective"),
    },
    skillFilters: buildSkillFilters(skillRows),
    skills: skillRows,
  };
}
