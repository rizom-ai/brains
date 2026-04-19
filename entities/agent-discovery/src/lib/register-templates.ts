import { paginationInfoSchema } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils";
import { enrichedAgentSchema } from "../schemas/agent";
import {
  AgentListTemplate,
  type AgentListProps,
} from "../templates/agent-list";
import {
  AgentDetailTemplate,
  type AgentDetailProps,
} from "../templates/agent-detail";

const agentListSchema = z.object({
  agents: z.array(enrichedAgentSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
  selectedStatus: z.enum(["all", "discovered", "approved"]),
});

export function getTemplates(): Record<string, Template> {
  return {
    "agent-list": createTemplate<
      z.infer<typeof agentListSchema>,
      AgentListProps
    >({
      name: "agent-list",
      description: "Agent directory list page template",
      schema: agentListSchema,
      dataSourceId: "agent-discovery:entities",
      requiredPermission: "public",
      layout: {
        component: AgentListTemplate,
      },
    }),
    "agent-detail": createTemplate<
      {
        agent: z.infer<typeof enrichedAgentSchema>;
        prevAgent: z.infer<typeof enrichedAgentSchema> | null;
        nextAgent: z.infer<typeof enrichedAgentSchema> | null;
      },
      AgentDetailProps
    >({
      name: "agent-detail",
      description: "Individual agent profile template",
      schema: z.object({
        agent: enrichedAgentSchema,
        prevAgent: enrichedAgentSchema.nullable(),
        nextAgent: enrichedAgentSchema.nullable(),
      }),
      dataSourceId: "agent-discovery:entities",
      requiredPermission: "public",
      layout: {
        component: AgentDetailTemplate,
      },
    }),
  };
}
