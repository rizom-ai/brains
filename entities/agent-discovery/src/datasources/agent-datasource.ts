import {
  BaseEntityDataSource,
  baseInputSchema,
  baseQuerySchema,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseDataSourceContext,
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger, z } from "@brains/utils";
import {
  agentFrontmatterSchema,
  agentStatusSchema,
  agentWithDataSchema,
} from "../schemas/agent";
import type { AgentEntity, AgentStatus, AgentWithData } from "../schemas/agent";
import { AgentAdapter } from "../adapters/agent-adapter";
import { AGENT_DATASOURCE_ID, AGENT_ENTITY_TYPE } from "../lib/constants";

const agentAdapter = new AgentAdapter();

interface AgentDetailData {
  agent: AgentWithData;
  prevAgent: AgentWithData | null;
  nextAgent: AgentWithData | null;
}

const agentQuerySchema = baseQuerySchema.extend({
  status: agentStatusSchema.optional(),
});

const agentInputSchema = baseInputSchema.extend({
  query: agentQuerySchema.optional(),
});

type AgentQuery = z.infer<typeof agentQuerySchema>;

interface AgentListData {
  agents: AgentWithData[];
  pagination: PaginationInfo | null;
  baseUrl: string | undefined;
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

  const sections = agentAdapter.parseAgentContent(entity.content);

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
export class AgentDataSource extends BaseEntityDataSource<
  AgentEntity,
  AgentWithData
> {
  readonly id = AGENT_DATASOURCE_ID;
  readonly name = "Agent Directory DataSource";
  readonly description = "Fetches and transforms agent entities for rendering";

  protected readonly config = {
    entityType: AGENT_ENTITY_TYPE,
    defaultSort: [
      { field: "discoveredAt" as const, direction: "desc" as const },
    ],
    defaultLimit: 50,
    lookupField: "slug" as const,
    enableNavigation: true,
  };

  constructor(logger: Logger) {
    super(logger);
  }

  protected transformEntity(entity: AgentEntity): AgentWithData {
    return parseAgentData(entity);
  }

  protected override buildDetailResult(
    item: AgentWithData,
    navigation: NavigationResult<AgentWithData> | null,
  ): AgentDetailData {
    return {
      agent: item,
      prevAgent: navigation?.prev ?? null,
      nextAgent: navigation?.next ?? null,
    };
  }

  protected override parseQuery(query: unknown): {
    entityType: string;
    query: AgentQuery;
  } {
    const parsed = agentInputSchema.parse(query);
    return {
      entityType: parsed.entityType ?? this.config.entityType,
      query: parsed.query ?? {},
    };
  }

  protected buildListResult(
    items: AgentWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): AgentListData {
    const status = agentStatusSchema.safeParse(query["status"]);

    return {
      agents: items,
      pagination,
      baseUrl: query.baseUrl,
      selectedStatus: status.success ? status.data : "all",
    };
  }

  override async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const { query: parsedQuery } = this.parseQuery(query);

    if (parsedQuery.id) {
      return super.fetch(query, outputSchema, context);
    }

    const { items, pagination } = await this.fetchList(
      parsedQuery,
      context.entityService,
      parsedQuery.status
        ? { filter: { metadata: { status: parsedQuery.status } } }
        : undefined,
    );

    return outputSchema.parse(
      this.buildListResult(items, pagination, parsedQuery),
    );
  }
}
