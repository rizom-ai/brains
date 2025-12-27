import {
  type DataSource,
  type BaseDataSourceContext,
  type PaginationInfo,
} from "@brains/datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
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

    // For detail view, also fetch prev/next projects for navigation
    // Filtered at database level when publishedOnly is set
    const filteredProjects: Project[] =
      await this.entityService.listEntities<Project>("project", {
        limit: 1000,
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      });

    // Sort by year (descending), then by title
    const sortedProjects = filteredProjects.sort((a, b) => {
      // Published projects come before drafts
      if (a.metadata.status !== b.metadata.status) {
        return a.metadata.status === "published" ? -1 : 1;
      }

      if (b.metadata.year !== a.metadata.year) {
        return b.metadata.year - a.metadata.year;
      }
      return a.metadata.title.localeCompare(b.metadata.title);
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
    // Fetch projects (filtered at database level when publishedOnly is set)
    const filteredProjects: Project[] =
      await this.entityService.listEntities<Project>("project", {
        limit: 1000,
        ...(context.publishedOnly !== undefined && {
          publishedOnly: context.publishedOnly,
        }),
      });

    // Sort by year (descending), then by title
    const sortedProjects = filteredProjects.sort((a, b) => {
      // Published projects come before drafts
      if (a.metadata.status !== b.metadata.status) {
        return a.metadata.status === "published" ? -1 : 1;
      }

      // Then by year (newest first)
      if (b.metadata.year !== a.metadata.year) {
        return b.metadata.year - a.metadata.year;
      }

      // Then by title
      return a.metadata.title.localeCompare(b.metadata.title);
    });

    // Apply pagination if page is specified
    const currentPage = page ?? 1;
    const itemsPerPage = pageSize ?? limit ?? sortedProjects.length;
    const totalItems = sortedProjects.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);

    // Calculate slice indices
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;

    // Get paginated projects
    const paginatedProjects =
      page !== undefined
        ? sortedProjects.slice(startIndex, endIndex)
        : limit !== undefined
          ? sortedProjects.slice(0, limit)
          : sortedProjects;

    // Parse frontmatter for full data
    const projectsWithData = paginatedProjects.map(parseProjectData);

    // Build pagination info (only when paginating)
    const pagination: PaginationInfo | null =
      page !== undefined
        ? {
            currentPage,
            totalPages,
            totalItems,
            pageSize: itemsPerPage,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1,
          }
        : null;

    const listData = {
      projects: projectsWithData,
      pagination,
      baseUrl, // Pass through for pagination component
    };

    return outputSchema.parse(listData);
  }
}
