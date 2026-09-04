import {
  defineEntityDataSource,
  parseMarkdownWithFrontmatter,
  z,
  type AnyEntityDataSourceDefinition,
  type BaseQuery,
  type PaginationInfo,
} from "@brains/sdk/entities";
import {
  agentFrontmatterSchema,
  agentWithDataSchema,
  agentEntitySchema,
} from "../schemas/agent";
import type { AgentEntity, AgentWithData } from "../schemas/agent";
import { parseAgentContent } from "../lib/agent-content";
import { AGENT_DATASOURCE_ID, AGENT_ENTITY_TYPE } from "../lib/constants";
import { agentViewSchema } from "../templates/agent-view";

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
 * DataSource for agent directory entities.
 * Handles list views (all agents, sorted by discovery date) and
 * detail views with prev/next navigation.
 */
/**
 * Agents for rendering: the directory a reader scans, and the card they open.
 *
 * The status filter is contributed to the query rather than applied to a
 * fetched page, so a filtered directory pages over the filtered set.
 */
export const agentDataSource: AnyEntityDataSourceDefinition =
  defineEntityDataSource({
    id: AGENT_DATASOURCE_ID,
    name: "Agent Directory DataSource",
    description: "Fetches and transforms agent entities for rendering",
    entityType: AGENT_ENTITY_TYPE,
    entitySchema: agentEntitySchema,
    defaultSort: [{ field: "discoveredAt", direction: "desc" }],
    defaultLimit: 50,
    // Agents are addressed by slug in routes; two records of one agent
    // resolve to one page.
    lookupField: "slug",
    enableNavigation: true,
    filter: (query) => {
      const status = agentStatusQuerySchema.safeParse(query["status"]);
      return status.success
        ? { filter: { metadata: { status: status.data } } }
        : undefined;
    },
    transform: (entity: AgentEntity): AgentWithData => parseAgentData(entity),
    // Return type inferred: the runtime needs a plain JSON object, and an
    // interface gets no implicit index signature. `agentViewSchema` is what
    // checks the shape, at render time.
    list: (
      items: unknown[],
      pagination: PaginationInfo | null,
      query: BaseQuery,
    ) => {
      const status = agentStatusQuerySchema.safeParse(query["status"]);
      return {
        agents: items.map((item) => agentViewSchema.parse(item)),
        pagination,
        baseUrl: query.baseUrl ?? null,
        selectedStatus: status.success ? status.data : ("all" as const),
      };
    },
    // Parsed rather than asserted, the way `list` above already does it: the
    // transform is erased by the definition's published type, so the schema is
    // what proves each neighbour is an agent.
    detail: ({ item, navigation }): AgentDetailData => ({
      agent: agentWithDataSchema.parse(item),
      prevAgent: navigation?.prev
        ? agentWithDataSchema.parse(navigation.prev)
        : null,
      nextAgent: navigation?.next
        ? agentWithDataSchema.parse(navigation.next)
        : null,
    }),
  });
