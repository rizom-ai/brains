import {
  generateMarkdownWithFrontmatter,
  parseMarkdown,
} from "@brains/sdk/entities";
import type {
  Project,
  ProjectFrontmatter,
  ProjectContent,
} from "../schemas/project";
import { ProjectBodyFormatter } from "../formatters/project-formatter";

const bodyFormatter = new ProjectBodyFormatter();

/**
 * Reads and writes the structured body a project is stored as.
 *
 * This used to be a full `BaseEntityAdapter`. The declarative entity builds
 * its adapter from the `markdown` codec on `project`, so the class's
 * `toMarkdown`/`fromMarkdown` stopped running once the package converted.
 * What is left is the structured-body half, which the codec does not own.
 */
export class ProjectAdapter {
  /** Parse structured content sections from entity body. */
  public parseStructuredContent(entity: Project): ProjectContent {
    return bodyFormatter.parse(parseMarkdown(entity.content).content);
  }

  /** Create project content with frontmatter and structured body. */
  public createProjectContent(
    frontmatter: Partial<ProjectFrontmatter>,
    body: ProjectContent,
  ): string {
    return generateMarkdownWithFrontmatter(
      bodyFormatter.format(body),
      frontmatter,
    );
  }
}

export const projectAdapter: ProjectAdapter = new ProjectAdapter();
