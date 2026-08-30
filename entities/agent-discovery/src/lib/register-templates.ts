import { createTemplate, paginationInfoSchema } from "@brains/sdk/entities";
import type { Template } from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import {
  AgentListTemplate,
  type AgentListProps,
} from "../templates/agent-list";
import {
  AgentDetailTemplate,
  type AgentDetailProps,
} from "../templates/agent-detail";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { AgentProximityMapTemplate } from "../templates/proximity-map-template";
import { agentViewSchema } from "../templates/agent-view";
import {
  proximityMapCopySchema,
  proximityMapDataSchema,
} from "./proximity-map-schema";
import { proximityMapScript } from "../widgets/proximity-map-script";
import {
  AGENT_DATASOURCE_ID,
  AGENT_DETAIL_TEMPLATE_NAME,
  AGENT_LIST_TEMPLATE_NAME,
  AGENT_PROXIMITY_DATASOURCE_ID,
  AGENT_PROXIMITY_TEMPLATE_NAME,
} from "./constants";

const agentStatusSchema = z.enum(["discovered", "approved", "archived"]);

const enrichedAgentViewSchema = agentViewSchema;

const agentListSchema = z.object({
  agents: z.array(enrichedAgentViewSchema),
  pageTitle: z.string().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
  selectedStatus: z.union([z.literal("all"), agentStatusSchema]),
});

// Served as a real file (emitted via template staticAssets) rather than a
// data: URI — data: script srcs are blocked by any script-src CSP.
const PROXIMITY_SCRIPT_SRC = "/scripts/agent-proximity-map.js";

// Overlay formatter for the map's authored hero copy. The map data comes from
// the datasource; this lets a site edit the surrounding copy as an ordinary
// markdown section (flat ## headings), which the content-overlay merge splices
// over the live payload. Absent fields fall back to the template defaults.
const proximityCopyFormatter = new StructuredContentFormatter(
  proximityMapCopySchema,
  {
    title: "Network",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headingLead", label: "Heading Lead", type: "string" },
      { key: "headingAccent", label: "Heading Accent", type: "string" },
      { key: "lede", label: "Lede", type: "string" },
      { key: "ctaLabel", label: "Cta Label", type: "string" },
      { key: "ctaHref", label: "Cta Href", type: "string" },
    ],
  },
);

export function getTemplates(): Record<string, Template> {
  return {
    [AGENT_PROXIMITY_TEMPLATE_NAME]: createTemplate({
      name: AGENT_PROXIMITY_TEMPLATE_NAME,
      description: "Semantic agent proximity map site section",
      schema: proximityMapDataSchema,
      dataSourceId: AGENT_PROXIMITY_DATASOURCE_ID,
      // Authored hero copy is merged over the live map data (content overlay).
      overlayFormatter: proximityCopyFormatter,
      requiredPermission: "public",
      runtimeScripts: [{ src: PROXIMITY_SCRIPT_SRC, defer: true }],
      staticAssets: { [PROXIMITY_SCRIPT_SRC]: proximityMapScript },
      layout: {
        component: AgentProximityMapTemplate,
      },
    }),
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
