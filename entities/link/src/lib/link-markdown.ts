import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import {
  linkFrontmatterSchema,
  type LinkMetadata,
  type linkMetadataSchema,
} from "../schemas/link";
import { definedFields } from "@brains/utils/strip-undefined";

/**
 * A link's frontmatter, in the order the link adapter wrote a new link:
 * its status, title, URL, description, when and where it was captured.
 * A file people wrote keeps its own order (writesInDocumentOrder).
 */
export function linkFrontmatter(
  metadata: LinkMetadata,
): Record<string, unknown> {
  return definedFields({
    status: metadata.status,
    title: metadata.title,
    url: metadata.url,
    description: metadata.description,
    capturedAt: metadata.capturedAt,
    source: { ref: metadata.source.ref, label: metadata.source.label },
  });
}

/** A link's frontmatter is its metadata; its body is its summary. */
export const linkMarkdown: EntityMarkdownCodec<typeof linkMetadataSchema> = {
  decode: ({ content, frontmatter }) => ({
    content,
    metadata: linkFrontmatterSchema.parse(frontmatter),
  }),
  // A whole document handed in has had its frontmatter decoded into the
  // metadata already; the body is written as the adapter wrote it.
  encode: ({ content, metadata }) => ({
    content: parseMarkdown(content).content,
    frontmatter: linkFrontmatter(metadata),
  }),
};

/** A link's summary: its body, trimmed, as the adapter read it. */
export function linkSummary(body: string): string {
  return body.trim();
}
