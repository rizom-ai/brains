import { BaseEntityAdapter } from "@brains/plugins";
import { slugify } from "@brains/utils";
import {
  projectSchema,
  projectFrontmatterSchema,
  type Project,
  type ProjectFrontmatter,
  type ProjectMetadata,
  type ProjectContent,
} from "../schemas/project";
import { ProjectBodyFormatter } from "../formatters/project-formatter";

const bodyFormatter = new ProjectBodyFormatter();

/**
 * Entity adapter for project entities
 * Handles frontmatter and structured body sections
 */
export class ProjectAdapter extends BaseEntityAdapter<
  Project,
  ProjectMetadata
> {
  constructor() {
    super({
      entityType: "project",
      schema: projectSchema,
      frontmatterSchema: projectFrontmatterSchema,
      supportsCoverImage: true,
      bodyFormatter,
    });
  }

  public toMarkdown(entity: Project): string {
    const body = this.extractBody(entity.content);
    try {
      const frontmatter = this.parseFrontMatter(
        entity.content,
        projectFrontmatterSchema,
      );
      const completeFrontmatter = {
        ...frontmatter,
        slug: frontmatter.slug ?? entity.metadata.slug,
      };
      return this.buildMarkdown(body, completeFrontmatter);
    } catch {
      return body;
    }
  }

  public fromMarkdown(markdown: string): Partial<Project> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      projectFrontmatterSchema,
    );
    const slug = frontmatter.slug ?? slugify(frontmatter.title);

    return {
      content: markdown,
      entityType: "project",
      metadata: {
        title: frontmatter.title,
        slug,
        status: frontmatter.status,
        publishedAt: frontmatter.publishedAt,
        year: frontmatter.year,
      },
    };
  }

  /** Parse project frontmatter from entity content */
  public parseProjectFrontmatter(entity: Project): ProjectFrontmatter {
    return this.parseFrontMatter(entity.content, projectFrontmatterSchema);
  }

  /** Parse structured content sections from entity body */
  public parseStructuredContent(entity: Project): ProjectContent {
    return bodyFormatter.parse(this.extractBody(entity.content));
  }

  /** Create project content with frontmatter and structured body */
  public createProjectContent(
    frontmatter: Partial<ProjectFrontmatter>,
    body: ProjectContent,
  ): string {
    const bodyMarkdown = bodyFormatter.format(body);
    return this.buildMarkdown(bodyMarkdown, frontmatter);
  }
}

export const projectAdapter = new ProjectAdapter();
