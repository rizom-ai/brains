import {
  defineEntity,
  slugifyUrl,
  z,
  type EntityDefinition,
  type EntityGenerationResult,
} from "@brains/sdk/entities";
import { directoryMarkdown } from "./lib/directory-markdown";
import {
  agentFrontmatterSchema,
  agentMetadataSchema,
  agentStatusSchema,
} from "./schemas/agent";
import { AGENT_ENTITY_TYPE } from "./lib/constants";
import { getTemplates } from "./lib/register-templates";
import { agentDataSource } from "./datasources/agent-datasource";
import { proximityMapDataSource } from "./datasources/proximity-map-datasource";
import {
  agentNetworkWidgetDeclaration,
  agentProximityWidgetDeclaration,
} from "./lib/agent-dashboard";
import { agentDiscoveryFromCards } from "./lib/atproto-card-events";
import { agentCardRefreshCheck } from "./lib/agent-card-refresh";
import { buildAgentFromCard } from "./lib/build-agent-content";
import { extractDomain, fetchAgentCard } from "./lib/fetch-agent-card";
import { getAgentDiscoveryInstructions } from "./lib/agent-instructions";

const generationInput = z.object({
  prompt: z.string().optional(),
  url: z.string().optional(),
  content: z.string().optional(),
  skipAi: z.boolean().optional(),
  status: agentStatusSchema.optional(),
});

/**
 * A saved remote peer-brain contact in the local agent directory.
 *
 * The brain hears about other brains three ways — someone names a domain, a
 * peer's directory mentions one, an atproto crawl finds a card — and all
 * three land here.
 */
export const agent: EntityDefinition<
  typeof AGENT_ENTITY_TYPE,
  typeof agentMetadataSchema
> = defineEntity({
  type: AGENT_ENTITY_TYPE,
  purpose: "A saved remote peer-brain contact in the local agent directory.",
  metadata: agentMetadataSchema,
  markdown: directoryMarkdown((raw) => {
    const frontmatter = agentFrontmatterSchema.parse(raw);
    // The slug is derived rather than stored: it is a function of the url,
    // and two records of one agent must resolve to one route.
    return agentMetadataSchema.parse({
      ...frontmatter,
      slug: slugifyUrl(frontmatter.url),
    });
  }),
  // Approval is the directory's publish gate: production site builds emit
  // detail routes only for approved agents.
  config: {
    projectionSourceRole: "supporting",
    publish: { publishStatuses: ["approved"] },
  },
  templates: getTemplates(),
  dataSources: [agentDataSource, proximityMapDataSource],
  dashboardWidgets: [
    agentNetworkWidgetDeclaration,
    agentProximityWidgetDeclaration,
  ],
  atprotoDiscovery: agentDiscoveryFromCards,
  checks: [agentCardRefreshCheck],
  generation: {
    input: generationInput,
    generate: async ({ input }): Promise<EntityGenerationResult> => {
      const domain = extractDomain(input.url ?? input.prompt ?? "");
      if (!domain) {
        return {
          success: false,
          error:
            "No URL or domain provided. Use: system_create agent with a domain like yeehaa.io",
        };
      }

      const card = await fetchAgentCard(domain, globalThis.fetch);
      if (!card) {
        return {
          success: false,
          error: `Could not fetch Agent Card from ${domain}. Make sure the agent is running and accessible.`,
        };
      }

      const { content, metadata, anchorName } = buildAgentFromCard(card, {
        ...(input.status !== undefined ? { status: input.status } : {}),
      });
      return {
        success: true,
        id: domain,
        content,
        metadata,
        resultExtras: { title: anchorName },
      };
    },
  },
  instructions: getAgentDiscoveryInstructions(),
});
