import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import { storedFormCodec } from "@brains/sdk/internal/entity-runtime";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";
import { z } from "@brains/utils/zod";
import {
  linkFrontmatterSchema,
  type LinkMetadata,
  type linkMetadataSchema,
} from "../schemas/link";
import { definedFields } from "@brains/utils/strip-undefined";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

/**
 * A link's frontmatter, in the order the link adapter wrote a new link:
 * its status, title, URL, description, when and where it was captured.
 * A file people wrote keeps its own order, as every write keeps it.
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

/**
 * The next form's frontmatter (docs/plans/one-stored-form.md): the source a
 * link was captured from as two flat keys, which Obsidian shows as
 * properties, in the place the nested source held.
 */
function linkNextFrontmatter(metadata: LinkMetadata): Record<string, unknown> {
  const { source, ...rest } = linkFrontmatter(metadata);
  return {
    ...rest,
    sourceRef: metadata.source.ref,
    sourceLabel: metadata.source.label,
    ...(source === undefined && {}),
  };
}

/** The next form's header: the source as two flat keys. */
const linkNextHeaderSchema = linkFrontmatterSchema
  .omit({ source: true })
  .extend({
    sourceRef: z.string().meta({ studioWidget: "provenance" }),
    sourceLabel: z.string().meta({ studioWidget: "provenance" }),
  });

/**
 * A link's frontmatter is its metadata; its body is its summary. It reads a
 * file in either form, the flat source keys over a nested source, and
 * writes the form its store writes.
 */
export const linkMarkdown: EntityMarkdownCodec<typeof linkMetadataSchema> =
  storedFormCodec<typeof linkMetadataSchema>({
    decode: ({ content, frontmatter }) => {
      const { sourceRef, sourceLabel, ...rest } = frontmatter;
      const nested =
        typeof rest["source"] === "object" && rest["source"] !== null
          ? rest["source"]
          : {};
      return {
        content,
        metadata: linkFrontmatterSchema.parse({
          ...rest,
          ...(sourceRef !== undefined && {
            source: { ...nested, ref: sourceRef, label: sourceLabel },
          }),
        }),
      };
    },
    header: linkNextHeaderSchema,
    oldHeader: linkFrontmatterSchema,
    places: [["source", "sourceRef", "sourceLabel"]],
    // A whole document handed in has had its frontmatter decoded into the
    // metadata already; the body is written as the adapter wrote it.
    encode: ({ content, metadata }) => ({
      content: parseMarkdown(content).content,
      frontmatter: linkNextFrontmatter(metadata),
    }),
  });

/** A link's summary: its body, trimmed, as the adapter read it. */
export function linkSummary(body: string): string {
  return body.trim();
}
