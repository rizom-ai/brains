import { parseAgentContent } from "../lib/agent-content";
import {
  agentEntitySchema,
  agentFrontmatterSchema,
  agentWithDataSchema,
  type agentMetadataSchema,
} from "../schemas/agent";
import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
} from "@brains/sdk/entities";
import { z } from "@brains/utils/zod";
import type { AgentEntity, AgentStatus, AgentWithData } from "../schemas/agent";
import { agentViewSchema, type AgentSchemaData } from "../templates/agent-view";
import { parseMarkdownWithFrontmatter } from "@brains/sdk/internal/entity-runtime";
import { type PaginationInfo } from "@brains/sdk/internal/presentation";

type AgentDefinition = EntityDefinition<"agent", typeof agentMetadataSchema>;

interface AgentDetailData {
  agent: AgentWithData;
  prevAgent: AgentWithData | null;
  nextAgent: AgentWithData | null;
}

type AgentStatusQuerySchema = z.ZodEnum<{
  discovered: "discovered";
  approved: "approved";
  archived: "archived";
}>;

const agentStatusQuerySchema: AgentStatusQuerySchema = z.enum([
  "discovered",
  "approved",
  "archived",
]);

interface AgentListData {
  agents: AgentSchemaData[];
  pagination: PaginationInfo | null;
  baseUrl: string | null;
  selectedStatus: "all" | AgentStatus;
}

/**
 * Parse an agent entity into display-ready data.
 * Extracts frontmatter and structured body sections (about, skills, notes).
 */
function parseAgentData(entity: AgentEntity): AgentWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    agentFrontmatterSchema,
  );

  const sections = parseAgentContent(entity.content);

  return agentWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    about: sections.about,
    skills: sections.skills,
    notes: sections.notes,
  });
}

/**
 * The agent directory's pages: a page of agents, newest discovered first,
 * filtered by status when the page names one, and one agent by its slug
 * with its neighbors, as the agent-discovery class served them under
 * agent-discovery:entities.
 */
export function agentDataSource(
  agent: AgentDefinition,
): EntityDataSourceDefinition<AgentDefinition, AgentWithData, AgentListData> {
  return defineDataSource({
    id: "entities",
    name: "Agent Directory DataSource",
    description: "Fetches and transforms agent entities for rendering",
    entity: agent,
    defaultSort: [{ field: "discoveredAt", direction: "desc" }],
    defaultLimit: 50,
    lookupField: "slug",
    enableNavigation: true,
    filter: (query) => {
      const status = agentStatusQuerySchema.safeParse(query["status"]);
      return status.success ? { metadata: { status: status.data } } : undefined;
    },
    transform: (entity) => parseAgentData(agentEntitySchema.parse(entity)),
    list: (items, pagination, query): AgentListData => {
      const status = agentStatusQuerySchema.safeParse(query["status"]);
      return {
        agents: items.map((item) => agentViewSchema.parse(item)),
        pagination,
        baseUrl: query.baseUrl ?? null,
        selectedStatus: status.success ? status.data : "all",
      };
    },
    detail: ({ item, navigation }): AgentDetailData => ({
      agent: item,
      prevAgent: navigation?.prev ?? null,
      nextAgent: navigation?.next ?? null,
    }),
  });
}
