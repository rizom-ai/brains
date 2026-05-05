import { paginationInfoSchema } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils";
import { agentStatusSchema, enrichedAgentSchema } from "../schemas/agent";
import {
  AgentListTemplate,
  type AgentListProps,
} from "../templates/agent-list";
import {
  AgentDetailTemplate,
  type AgentDetailProps,
} from "../templates/agent-detail";
import {
  AGENT_DATASOURCE_ID,
  AGENT_DETAIL_TEMPLATE_NAME,
  AGENT_LIST_TEMPLATE_NAME,
} from "./constants";

const agentListSchema = z.object({
  agents: z.array(enrichedAgentSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
  selectedStatus: z.union([z.literal("all"), agentStatusSchema]),
});

export function getTemplates(): Record<string, Template> {
  return {
    [AGENT_LIST_TEMPLATE_NAME]: createTemplate<
      z.infer<typeof agentListSchema>,
      AgentListProps
    >({
      name: AGENT_LIST_TEMPLATE_NAME,
      description: "Agent directory list page template",
      schema: agentListSchema,
      dataSourceId: AGENT_DATASOURCE_ID,
      requiredPermission: "public",
      layout: {
        component: AgentListTemplate,
      },
    }),
    [AGENT_DETAIL_TEMPLATE_NAME]: createTemplate<
      {
        agent: z.infer<typeof enrichedAgentSchema>;
        prevAgent: z.infer<typeof enrichedAgentSchema> | null;
        nextAgent: z.infer<typeof enrichedAgentSchema> | null;
      },
      AgentDetailProps
    >({
      name: AGENT_DETAIL_TEMPLATE_NAME,
      description: "Individual agent profile template",
      schema: z.object({
        agent: enrichedAgentSchema,
        prevAgent: enrichedAgentSchema.nullable(),
        nextAgent: enrichedAgentSchema.nullable(),
      }),
      dataSourceId: AGENT_DATASOURCE_ID,
      requiredPermission: "public",
      layout: {
        component: AgentDetailTemplate,
      },
    }),
  };
}
