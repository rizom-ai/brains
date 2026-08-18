import {
  defineEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  EntityDataSourceDefinition,
  PaginationInfo,
} from "@brains/plugins";
import type { Project, ProjectContent } from "../schemas/project";
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

/**
 * Parse frontmatter, extract body and structured content from entity.
 */
export function parseProjectData(entity: Project): ProjectWithData {
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
 * Projects list and detail, ordered newest first with prev/next navigation.
 */
export const projectDataSource: EntityDataSourceDefinition<
  Project,
  ProjectWithData,
  {
    projects: ProjectSchemaData[];
    pagination: PaginationInfo | null;
    baseUrl: string | null;
  }
> = defineEntityDataSource({
  id: "entities",
  name: "Portfolio Project DataSource",
  description: "Fetches and transforms project entities for rendering",
  entityType: "project",
  defaultSort: [
    { field: "year", direction: "desc" },
    { field: "title", direction: "asc" },
  ],
  defaultLimit: 10,
  enableNavigation: true,
  transform: (entity: Project): ProjectWithData => parseProjectData(entity),
  list: (items: ProjectWithData[], pagination, query) => ({
    projects: items.map((item) => projectViewSchema.parse(item)),
    pagination,
    baseUrl: query.baseUrl ?? null,
  }),
  detail: ({ item, navigation }) => ({
    project: item,
    prevProject: navigation?.prev ?? null,
    nextProject: navigation?.next ?? null,
  }),
});
