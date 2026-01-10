import type {
  IEntityService,
  DataSource,
  BaseDataSourceContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import {
  parseMarkdownWithFrontmatter,
  buildPaginationInfo,
} from "@brains/plugins";
import { z } from "@brains/utils";
import type { Project } from "../schemas/project";
import {
  projectFrontmatterSchema,
  projectWithDataSchema,
  type ProjectWithData,
} from "../schemas/project";
import { projectAdapter } from "../adapters/project-adapter";

// Schema for fetch query parameters
const entityFetchQuerySchema = z.object({
  entityType: z.string(),
  query: z
    .object({
      id: z.string().optional(), // Fetch by slug
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      baseUrl: z.string().optional(), // For pagination links
    })
    .optional(),
});

// Re-export for convenience
export type { ProjectWithData };

/**
 * Parse frontmatter, extract body and structured content from entity
 * Uses Zod schema to validate the output
 */
function parseProjectData(entity: Project): ProjectWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    projectFrontmatterSchema,
  );

  const structuredContent = projectAdapter.parseStructuredContent(entity);

  // Use schema to validate and parse
  return projectWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content, // Markdown without frontmatter
    structuredContent,
  });
}

/**
 * DataSource for fetching and transforming project entities
 * Handles list views and detail views for portfolio projects
 */
export class ProjectDataSource implements DataSource {
  public readonly id = "portfolio:entities";
  public readonly name = "Portfolio Project DataSource";
  public readonly description =
    "Fetches and transforms project entities for rendering";

  constructor(
    private entityService: IEntityService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("ProjectDataSource initialized");
  }

  /**
   * Fetch and transform project entities to template-ready format
   * @param context - Context with environment and URL generation
   */
  async fetch<T>(
    query: unknown,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    // Parse and validate query parameters
    const params = entityFetchQuerySchema.parse(query);

    // Case 1: Fetch single project by slug
    if (params.query?.id) {
      return this.fetchSingleProject(params.query.id, outputSchema, context);
    }

    // Case 2: Fetch list of all projects (with optional pagination)
    return this.fetchProjectList(
      params.query?.limit,
      params.query?.page,
      params.query?.pageSize,
      params.query?.baseUrl,
      outputSchema,
      context,
    );
  }

  /**
   * Fetch a single project by slug
   */
  private async fetchSingleProject<T>(
    slug: string,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    // Query by slug in metadata
    const entities: Project[] = await this.entityService.listEntities<Project>(
      "project",
      {
        filter: {
          metadata: {
            slug,
          },
        },
        limit: 1,
      },
    );

    const entity = entities[0];
    if (!entity) {
      throw new Error(`Project not found with slug: ${slug}`);
    }

    // Parse frontmatter and structured content
    const project = parseProjectData(entity);

    // For detail view, fetch projects sorted for prev/next navigation
    const sortedProjects: Project[] =
      await this.entityService.listEntities<Project>("project", {
        limit: 1000,
        sortFields: [
          { field: "year", direction: "desc" },
          { field: "title", direction: "asc" },
        ],
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      });

    const currentIndex = sortedProjects.findIndex((p) => p.id === entity.id);
    const prevEntity =
      currentIndex > 0 ? sortedProjects[currentIndex - 1] : null;
    const nextEntity =
      currentIndex < sortedProjects.length - 1
        ? sortedProjects[currentIndex + 1]
        : null;
    const prevProject = prevEntity ? parseProjectData(prevEntity) : null;
    const nextProject = nextEntity ? parseProjectData(nextEntity) : null;

    const detailData = {
      project,
      prevProject,
      nextProject,
    };

    return outputSchema.parse(detailData);
  }

  /**
   * Fetch list of all projects with optional pagination
   */
  private async fetchProjectList<T>(
    limit: number | undefined,
    page: number | undefined,
    pageSize: number | undefined,
    baseUrl: string | undefined,
    outputSchema: z.ZodSchema<T>,
    context: BaseDataSourceContext,
  ): Promise<T> {
    const currentPage = page ?? 1;
    const itemsPerPage = pageSize ?? limit ?? 10;
    const offset = (currentPage - 1) * itemsPerPage;

    // Fetch projects with database-level sorting, filtering, and pagination
    const projects: Project[] = await this.entityService.listEntities<Project>(
      "project",
      {
        limit: itemsPerPage,
        offset,
        sortFields: [
          { field: "year", direction: "desc" },
          { field: "title", direction: "asc" },
        ],
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      },
    );

    // Get total count for pagination info (only if page is specified)
    let pagination = null;
    if (page !== undefined) {
      const totalItems = await this.entityService.countEntities("project", {
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      });
      pagination = buildPaginationInfo(totalItems, currentPage, itemsPerPage);
    }

    // Parse frontmatter for full data
    const projectsWithData = projects.map(parseProjectData);

    const listData = {
      projects: projectsWithData,
      pagination,
      baseUrl, // Pass through for pagination component
    };

    return outputSchema.parse(listData);
  }
}
