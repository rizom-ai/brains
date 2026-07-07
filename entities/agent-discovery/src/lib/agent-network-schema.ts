import { z } from "@brains/utils/zod";
import { agentFrontmatterSchema, agentStatusSchema } from "../schemas/agent";

const agentKindSchema: typeof agentFrontmatterSchema.shape.kind =
  agentFrontmatterSchema.shape.kind;

export const AGENT_NETWORK_KINDS: readonly [
  "all",
  "professional",
  "team",
  "collective",
] = ["all", "professional", "team", "collective"];

export const agentNetworkAgentRowSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  description: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  kind: typeof agentKindSchema;
  status: typeof agentStatusSchema;
  discoveredAt: z.ZodString;
}> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  kind: agentKindSchema,
  status: agentStatusSchema,
  discoveredAt: z.string(),
});

export const agentNetworkSkillRowSchema: z.ZodObject<{
  id: z.ZodString;
  name: z.ZodString;
  tags: z.ZodArray<z.ZodString>;
  sourceLabel: z.ZodString;
  sourceType: z.ZodEnum<{ brain: "brain"; agent: "agent" }>;
}> = z.object({
  id: z.string(),
  name: z.string(),
  tags: z.array(z.string()),
  sourceLabel: z.string(),
  sourceType: z.enum(["brain", "agent"]),
});

export const agentNetworkTagFilterSchema: z.ZodObject<{
  tag: z.ZodString;
  count: z.ZodNumber;
  variant: z.ZodOptional<z.ZodEnum<{ gap: "gap" }>>;
}> = z.object({
  tag: z.string(),
  count: z.number(),
  variant: z.enum(["gap"]).optional(),
});

export const agentNetworkWidgetDataSchema: z.ZodObject<{
  counts: z.ZodObject<{
    agents: z.ZodNumber;
    skills: z.ZodNumber;
  }>;
  agents: z.ZodObject<{
    all: z.ZodArray<typeof agentNetworkAgentRowSchema>;
    professional: z.ZodArray<typeof agentNetworkAgentRowSchema>;
    team: z.ZodArray<typeof agentNetworkAgentRowSchema>;
    collective: z.ZodArray<typeof agentNetworkAgentRowSchema>;
  }>;
  skillFilters: z.ZodArray<typeof agentNetworkTagFilterSchema>;
  skills: z.ZodArray<typeof agentNetworkSkillRowSchema>;
}> = z.object({
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
