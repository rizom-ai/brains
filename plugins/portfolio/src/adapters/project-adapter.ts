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

/**
 * Parse structured content sections from markdown body
 * Extracts ## Context, ## Problem, ## Solution, ## Outcome sections
 */
function parseBodySections(body: string): ProjectContent {
  const sections: ProjectContent = {
    context: "",
    problem: "",
    solution: "",
    outcome: "",
  };

  const sectionRegex = /^## (Context|Problem|Solution|Outcome)\s*$/gim;
  const parts = body.split(sectionRegex);

  for (let i = 1; i < parts.length; i += 2) {
    const heading = parts[i]?.toLowerCase() as keyof ProjectContent;
    const content = parts[i + 1]?.trim() ?? "";

    if (heading in sections) {
      sections[heading] = content;
    }
  }

  return sections;
}

/**
 * Generate structured body markdown from sections
 */
function generateBodyMarkdown(content: ProjectContent): string {
  const sections: string[] = [];

  if (content.context) {
    sections.push(`## Context\n\n${content.context}`);
  }
  if (content.problem) {
    sections.push(`## Problem\n\n${content.problem}`);
  }
  if (content.solution) {
    sections.push(`## Solution\n\n${content.solution}`);
  }
  if (content.outcome) {
    sections.push(`## Outcome\n\n${content.outcome}`);
  }

  return sections.join("\n\n");
}

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
    return parseBodySections(this.extractBody(entity.content));
  }

  /** Create project content with frontmatter and structured body */
  public createProjectContent(
    frontmatter: Partial<ProjectFrontmatter>,
    body: ProjectContent,
  ): string {
    const bodyMarkdown = generateBodyMarkdown(body);
    return this.buildMarkdown(bodyMarkdown, frontmatter);
  }
}

export const projectAdapter = new ProjectAdapter();
