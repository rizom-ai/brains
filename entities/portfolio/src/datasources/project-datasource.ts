import { BaseEntityDataSource } from "@brains/plugins";
import type {
  BaseQuery,
  NavigationResult,
  PaginationInfo,
  EntityDataSourceConfig,
} from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import {
  projectSchema,
  type Project,
  type ProjectContent,
} from "../schemas/project";
import {
  projectFrontmatterSchema,
  projectWithDataSchema,
  type ProjectWithData,
} from "../schemas/project";
import { projectAdapter } from "../adapters/project-adapter";
import {
  projectViewSchema,
  type ProjectSchemaData,
} from "../templates/project-view";

// Re-export for convenience
export type { ProjectWithData };

interface ProjectDetailData {
  project: ProjectWithData;
  prevProject: ProjectWithData | null;
  nextProject: ProjectWithData | null;
}

interface ProjectListData {
  projects: ProjectSchemaData[];
  pagination: PaginationInfo | null;
  baseUrl: string | null;
}

/**
 * Parse frontmatter, extract body and structured content from entity.
 */
function parseProjectData(entity: Project): ProjectWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    projectFrontmatterSchema,
  );

  let structuredContent: ProjectContent | undefined;
  try {
    structuredContent = projectAdapter.parseStructuredContent(entity);
  } catch {
    structuredContent = undefined;
  }

  return projectWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
    ...(structuredContent && { structuredContent }),
  });
}

/**
 * DataSource for fetching and transforming project entities.
 * Handles list views with pagination and detail views with prev/next navigation.
 */
export class ProjectDataSource extends BaseEntityDataSource<
  Project,
  ProjectWithData,
  ProjectListData
> {
  readonly id: string = "portfolio:entities";
  readonly name: string = "Portfolio Project DataSource";
  readonly description: string =
    "Fetches and transforms project entities for rendering";

  protected readonly config: EntityDataSourceConfig<Project> = {
    entityType: "project",
    entitySchema: projectSchema,
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

  protected override buildDetailResult(
    item: ProjectWithData,
    navigation: NavigationResult<ProjectWithData> | null,
  ): ProjectDetailData {
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
  ): ProjectListData {
    return {
      projects: items.map((item) => projectViewSchema.parse(item)),
      pagination,
      baseUrl: query.baseUrl ?? null,
    };
  }
}
