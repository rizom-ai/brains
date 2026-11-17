import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import { ProjectBodyFormatter } from "../formatters/project-formatter";
import {
  projectFrontmatterSchema,
  type ProjectContent,
  type ProjectMetadata,
  type projectMetadataSchema,
} from "../schemas/project";
import {
  slugStatingFrontmatter,
  slugStatingMetadata,
} from "@brains/sdk/internal/entity-runtime";

const bodyFormatter = new ProjectBodyFormatter();

/** A project's structured sections, written as its body. */
export function projectBody(content: ProjectContent): string {
  return bodyFormatter.format(content);
}

/** The scaffold a new project's body starts from: its four sections. */
export const projectBodyTemplate: string = bodyFormatter.generateBodyTemplate();

/** A project's structured sections, read from its body. */
export function projectSections(body: string): ProjectContent {
  return bodyFormatter.parse(body);
}

/**
 * A project's frontmatter, in the order the project adapter wrote it: its
 * fields in schema order, the slug among them when the file states it and
 * after them when it was resolved from the title, then the error a failed
 * generation recorded.
 */
export function projectFrontmatter(
  metadata: ProjectMetadata,
): Record<string, unknown> {
  return slugStatingFrontmatter(metadata, {
    status: metadata.status,
    publishedAt: metadata.publishedAt,
    description: metadata.description,
    year: metadata.year,
    coverImageId: metadata.coverImageId,
    ogImageId: metadata.ogImageId,
    url: metadata.url,
  });
}

/** A project as its stored document: its frontmatter and its body. */
export function projectDocument(project: {
  readonly content: string;
  readonly metadata: ProjectMetadata;
}): string {
  return generateMarkdown(
    projectFrontmatter(project.metadata),
    project.content,
  );
}

/**
 * A project's frontmatter is its metadata, the slug resolved from the title
 * when the file states none; its body is its case study, as written.
 */
export const projectMarkdown: EntityMarkdownCodec<
  typeof projectMetadataSchema
> = {
  decode: ({ content, frontmatter }) => {
    const parsed = projectFrontmatterSchema.parse(frontmatter);
    return { content, metadata: slugStatingMetadata(parsed, frontmatter) };
  },
  // A whole document handed in has had its frontmatter decoded into the
  // metadata already; the body is written as the adapter wrote it.
  encode: ({ content, metadata }) => ({
    content: parseMarkdown(content).content,
    frontmatter: projectFrontmatter(metadata),
  }),
};
