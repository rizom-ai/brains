import { z } from "@brains/utils/zod";
import { agentFrontmatterSchema, agentStatusSchema } from "../schemas/agent";

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
