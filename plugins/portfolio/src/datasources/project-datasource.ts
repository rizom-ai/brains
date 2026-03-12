import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { Project } from "../schemas/project";
import {
  projectFrontmatterSchema,
  projectWithDataSchema,
  type ProjectWithData,
} from "../schemas/project";
import { projectAdapter } from "../adapters/project-adapter";

// Re-export for convenience
export type { ProjectWithData };

/**
 * Parse frontmatter, extract body and structured content from entity.
 */
function parseProjectData(entity: Project): ProjectWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    projectFrontmatterSchema,
  );

  const structuredContent = projectAdapter.parseStructuredContent(entity);

  return projectWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
    structuredContent,
  });
}

/**
 * DataSource for fetching and transforming project entities.
 * Handles list views with pagination and detail views with prev/next navigation.
 */
export class ProjectDataSource extends BaseEntityDataSource<
  Project,
  ProjectWithData
> {
  readonly id = "portfolio:entities";
  readonly name = "Portfolio Project DataSource";
  readonly description =
    "Fetches and transforms project entities for rendering";

  protected readonly config = {
    entityType: "project",
    defaultSort: [
      { field: "year" as const, direction: "desc" as const },
      { field: "title" as const, direction: "asc" as const },
    ],
    defaultLimit: 10,
    enableNavigation: true,
  };

  constructor(logger: Logger) {
    super(logger);
    this.logger.debug("ProjectDataSource initialized");
  }

  protected transformEntity(entity: Project): ProjectWithData {
    return parseProjectData(entity);
  }

  protected buildDetailResult(
    item: ProjectWithData,
    navigation: NavigationResult<ProjectWithData> | null,
  ) {
    return {
      project: item,
      prevProject: navigation?.prev ?? null,
      nextProject: navigation?.next ?? null,
    };
  }

  protected buildListResult(
    items: ProjectWithData[],
    pagination: PaginationInfo | null,
    query: BaseQuery,
  ) {
    return {
      projects: items,
      pagination,
      baseUrl: query.baseUrl,
    };
  }
}
