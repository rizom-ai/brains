import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
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
  AGENT_ENTITY_TYPE,
  AGENT_LIST_TEMPLATE_NAME,
} from "./constants";

const contentVisibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

const paginationInfoSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

const agentSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});

const agentStatusSchema = z.enum(["discovered", "approved", "archived"]);

const agentKindSchema = z.enum(["professional", "team", "collective"]);

const agentFrontmatterSchema = z.object({
  name: z.string(),
  kind: agentKindSchema,
  organization: z.string().optional(),
  brainName: z.string(),
  url: z.url(),
  did: z.string().optional(),
  repoDid: z.string().optional(),
  brainDid: z.string().optional(),
  anchorDid: z.string().optional(),
  cardUri: z.string().optional(),
  cardCid: z.string().optional(),
  a2aEndpoint: z.url().optional(),
  status: agentStatusSchema,
  discoveredAt: z.string(),
});

const agentMetadataSchema = z.object({
  name: z.string(),
  url: z.url(),
  status: agentStatusSchema,
  discoveredAt: z.string().optional(),
  slug: z.string(),
  repoDid: z.string().optional(),
  brainDid: z.string().optional(),
  anchorDid: z.string().optional(),
  cardUri: z.string().optional(),
  cardCid: z.string().optional(),
  a2aEndpoint: z.url().optional(),
});

/**
 * Datasource-facing schema. URL/display fields are added by site-builder
 * after content resolution, before the component is rendered.
 */
const enrichedAgentViewSchema = z.object({
  id: z.string(),
  entityType: z.literal(AGENT_ENTITY_TYPE),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: agentMetadataSchema,
  contentHash: z.string(),
  frontmatter: agentFrontmatterSchema,
  about: z.string(),
  skills: z.array(agentSkillSchema),
  notes: z.string(),
  url: z.string().optional(),
  typeLabel: z.string().optional(),
});

const agentListSchema = z.object({
  agents: z.array(enrichedAgentViewSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
  selectedStatus: z.union([z.literal("all"), agentStatusSchema]),
});

export function getTemplates(): Record<string, Template> {
  return {
    [AGENT_LIST_TEMPLATE_NAME]: createTemplate<
      z.output<typeof agentListSchema>,
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
        agent: z.output<typeof enrichedAgentViewSchema>;
        prevAgent: z.output<typeof enrichedAgentViewSchema> | null;
        nextAgent: z.output<typeof enrichedAgentViewSchema> | null;
      },
      AgentDetailProps
    >({
      name: AGENT_DETAIL_TEMPLATE_NAME,
      description: "Individual agent profile template",
      schema: z.object({
        agent: enrichedAgentViewSchema,
        prevAgent: enrichedAgentViewSchema.nullable(),
        nextAgent: enrichedAgentViewSchema.nullable(),
      }),
      dataSourceId: AGENT_DATASOURCE_ID,
      requiredPermission: "public",
      layout: {
        component: AgentDetailTemplate,
      },
    }),
  };
}
