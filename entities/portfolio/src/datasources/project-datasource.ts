import type { JsonObject } from "@brains/contracts";
import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
  type EntityOf,
} from "@brains/sdk/entities";
import { projectDocument, projectSections } from "../lib/project-markdown";
import {
  projectFrontmatterSchema,
  projectWithDataSchema,
  type ProjectContent,
  type ProjectWithData,
  type projectMetadataSchema,
} from "../schemas/project";
import { projectViewSchema } from "../templates/project-view";

// Re-export for convenience
export type { ProjectWithData };

type ProjectDefinition = EntityDefinition<
  "project",
  typeof projectMetadataSchema
>;

/**
 * A project as the site reads it, as the project plugin class's data
 * source read it: its record, its content the document it is stored as,
 * its metadata the fields the class indexed, its frontmatter, its body and
 * its structured sections.
 */
function projectWithData(entity: EntityOf<ProjectDefinition>): ProjectWithData {
  const { metadata } = entity;
  let structuredContent: ProjectContent | undefined;
  try {
    structuredContent = projectSections(entity.content);
  } catch {
    // A free-form body has no case study sections to read.
    structuredContent = undefined;
  }
  return projectWithDataSchema.parse({
    ...entity,
    content: projectDocument(entity),
    metadata: {
      title: metadata.title,
      status: metadata.status,
      ...(metadata.publishedAt !== undefined && {
        publishedAt: metadata.publishedAt,
      }),
      year: metadata.year,
      slug: metadata.slug,
      description: metadata.description,
      ...(metadata.error !== undefined && { error: metadata.error }),
    },
    frontmatter: projectFrontmatterSchema.parse(metadata),
    body: entity.content,
    ...(structuredContent && { structuredContent }),
  });
}

/**
 * Fetches and transforms projects for rendering: a paged list, or one
 * project with its neighbors.
 */
export function projectDataSource(
  project: ProjectDefinition,
): EntityDataSourceDefinition<ProjectDefinition, ProjectWithData, JsonObject> {
  return defineDataSource({
    id: "entities",
    name: "Portfolio Project DataSource",
    description: "Fetches and transforms project entities for rendering",
    entity: project,
    defaultSort: [
      { field: "year", direction: "desc" },
      { field: "title", direction: "asc" },
    ],
    defaultLimit: 10,
    enableNavigation: true,
    transform: projectWithData,
    list: (items, pagination, query) => ({
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
}
