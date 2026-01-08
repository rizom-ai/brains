import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z, slugify } from "@brains/utils";
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

  // Split by h2 headings
  const sectionRegex = /^## (Context|Problem|Solution|Outcome)\s*$/gim;
  const parts = body.split(sectionRegex);

  // parts will be: [preamble, "Context", contextContent, "Problem", problemContent, ...]
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
export class ProjectAdapter implements EntityAdapter<Project, ProjectMetadata> {
  public readonly entityType = "project" as const;
  public readonly schema = projectSchema;
  public readonly supportsCoverImage = true;

  /**
   * Convert project entity to markdown with frontmatter
   * Merges auto-generated metadata (like slug) back into frontmatter
   */
  public toMarkdown(entity: Project): string {
    // Extract the body content without any existing frontmatter
    let contentBody = entity.content;
    try {
      const parsed = parseMarkdownWithFrontmatter(entity.content, z.object({}));
      contentBody = parsed.content;
    } catch {
      // Content doesn't have frontmatter, use as-is
    }

    // Parse frontmatter from content and regenerate with it
    try {
      const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
        entity.content,
        projectFrontmatterSchema,
      );

      // Merge auto-generated slug from metadata if missing in frontmatter
      const completeFrontmatter = {
        ...frontmatter,
        slug: frontmatter.slug ?? entity.metadata.slug,
      };

      return generateMarkdownWithFrontmatter(contentBody, completeFrontmatter);
    } catch {
      // No valid frontmatter, return content as-is
      return contentBody;
    }
  }

  /**
   * Parse markdown with frontmatter to create partial project entity
   * Syncs frontmatter → metadata for key searchable fields
   * Auto-generates slug from title if not provided in frontmatter
   */
  public fromMarkdown(markdown: string): Partial<Project> {
    // Parse frontmatter
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      projectFrontmatterSchema,
    );

    // Auto-generate slug from title if not provided
    const slug = frontmatter.slug ?? slugify(frontmatter.title);

    // Sync key fields from frontmatter to metadata for fast queries
    return {
      content: markdown, // Store full markdown including frontmatter
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

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: Project): ProjectMetadata {
    return entity.metadata;
  }

  /**
   * Parse frontmatter from markdown
   */
  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for project entity
   */
  public generateFrontMatter(entity: Project): string {
    try {
      const { metadata } = parseMarkdownWithFrontmatter(
        entity.content,
        projectFrontmatterSchema,
      );
      return generateFrontmatter(metadata);
    } catch {
      return "";
    }
  }

  /**
   * Parse project frontmatter from entity content
   */
  public parseProjectFrontmatter(entity: Project): ProjectFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(
      entity.content,
      projectFrontmatterSchema,
    );
    return metadata;
  }

  /**
   * Parse structured content sections from entity body
   */
  public parseStructuredContent(entity: Project): ProjectContent {
    // Extract body without frontmatter
    try {
      const { content: body } = parseMarkdownWithFrontmatter(
        entity.content,
        z.object({}),
      );
      return parseBodySections(body);
    } catch {
      return parseBodySections(entity.content);
    }
  }

  /**
   * Create project content with frontmatter and structured body
   */
  public createProjectContent(
    frontmatter: Partial<ProjectFrontmatter>,
    body: ProjectContent,
  ): string {
    const bodyMarkdown = generateBodyMarkdown(body);
    return generateMarkdownWithFrontmatter(bodyMarkdown, frontmatter);
  }
}

export const projectAdapter = new ProjectAdapter();
