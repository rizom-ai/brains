import {
  BaseEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  agentFrontmatterSchema,
  agentWithDataSchema,
  type AgentEntity,
  type AgentWithData,
} from "../schemas/agent";
import { AgentAdapter } from "../adapters/agent-adapter";

const agentAdapter = new AgentAdapter();

interface AgentDetailData {
  agent: AgentWithData;
  prevAgent: AgentWithData | null;
  nextAgent: AgentWithData | null;
}

interface AgentListData {
  agents: AgentWithData[];
  pagination: PaginationInfo | null;
  baseUrl: string | undefined;
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
  readonly id = "agent-directory:entities";
  readonly name = "Agent Directory DataSource";
  readonly description = "Fetches and transforms agent entities for rendering";

  protected readonly config = {
    entityType: "agent",
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

  protected buildListResult(
    items: AgentWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ): AgentListData {
    return {
      agents: items,
      pagination,
      baseUrl: query.baseUrl,
    };
  }
}
