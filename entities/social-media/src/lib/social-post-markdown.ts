import { recordFields } from "@brains/contracts";
import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import { storedFormCodec } from "@brains/sdk/internal/entity-runtime";
import { z } from "@brains/utils/zod";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import { slugify } from "@brains/utils/string-utils";
import {
  platformSchema,
  socialPostFrontmatterSchema,
  socialPostMetadataSchema,
  socialPostStatusSchema,
  socialPostWithDataSchema,
  type Platform,
  type SocialPost,
  type SocialPostMetadata,
  type SocialPostWithData,
} from "../schemas/social-post";
import { definedFields } from "@brains/utils/strip-undefined";

// Legacy: also reads the header form written before 0.2.0-alpha.760; removed with stored-form-old-headers (docs/legacy-code-inventory.json).

/** A post's slug: its platform and its title, as the adapter resolved it. */
export function socialPostSlug(platform: Platform, title: string): string {
  return `${platform}-${slugify(title)}`;
}

/**
 * A post's frontmatter, in the order the social post adapter wrote it: its
 * fields in schema order, then a slug the file stated, which the adapter
 * kept. The resolved slug and a failed publish's error are the record's
 * own and never in the file.
 */
export function socialPostFrontmatter(
  metadata: SocialPostMetadata,
): Record<string, unknown> {
  return definedFields({
    title: metadata.title,
    platform: metadata.platform,
    status: metadata.status,
    coverImageId: metadata.coverImageId,
    documents: metadata.documents?.map(({ id }) => ({ id })),
    publishedAt: metadata.publishedAt,
    platformPostId: metadata.platformPostId,
    sourceEntityId: metadata.sourceEntityId,
    sourceEntityType: metadata.sourceEntityType,
    slug: metadata.statedSlug,
  });
}

/**
 * A post's frontmatter in its next form (docs/plans/one-stored-form.md):
 * its document attachments as a list of document ids, which Obsidian shows
 * as a property, in the place the list of attachments held.
 */
function socialPostNextFrontmatter(
  metadata: SocialPostMetadata,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(socialPostFrontmatter(metadata)).map(([key, value]) =>
      key === "documents"
        ? ["documentIds", metadata.documents?.map(({ id }) => id)]
        : [key, value],
    ),
  );
}

/** The next form's header: the attachments as a list of document ids. */
const socialPostNextHeaderSchema = socialPostFrontmatterSchema
  .omit({ documents: true })
  .extend({
    documentIds: z
      .array(z.string().min(1))
      .optional()
      .describe("Document entity IDs attached for publishing"),
  });

/** A file's attachments: its document ids over a list of attachments. */
function statedDocuments(
  frontmatter: Record<string, unknown>,
): Record<string, unknown> {
  const { documentIds, ...rest } = frontmatter;
  return Array.isArray(documentIds)
    ? {
        ...rest,
        documents: documentIds.map((id: unknown) => ({ id })),
      }
    : rest;
}

/** What a file states: a file may leave out the platform and the status. */
const statedSchema = socialPostMetadataSchema
  .omit({ slug: true, error: true, statedSlug: true })
  .extend({
    platform: platformSchema.optional(),
    status: socialPostStatusSchema.optional(),
  });

/**
 * A post's frontmatter is its metadata, a file that names no platform or
 * status a LinkedIn draft, its slug resolved from them; its body is the
 * post's text. It reads a file in either stored form and writes the form
 * its store writes.
 */
export const socialPostMarkdown: EntityMarkdownCodec<
  typeof socialPostMetadataSchema
> = storedFormCodec<typeof socialPostMetadataSchema>({
  decode: ({ content, frontmatter }) => {
    const stated = statedSchema.parse(statedDocuments(frontmatter));
    // A post that names neither is a LinkedIn draft, as the adapter read it.
    const platform = stated.platform ?? "linkedin";
    const status = stated.status ?? "draft";
    const statedSlug = frontmatter["slug"];
    return {
      content,
      metadata: {
        ...stated,
        platform,
        status,
        slug: socialPostSlug(platform, stated.title),
        ...(typeof statedSlug === "string" && { statedSlug }),
      },
    };
  },
  // A whole document handed in has had its frontmatter decoded into the
  // metadata already; the body is written as the adapter wrote it.
  encode: ({ content, metadata }) => ({
    content: parseMarkdown(content).content,
    frontmatter: socialPostNextFrontmatter(metadata),
  }),
  header: socialPostNextHeaderSchema,
  oldHeader: socialPostFrontmatterSchema,
  places: [["documents", "documentIds"]],
});

/** A post as its stored document, in the form the release writes. */
export function socialPostDocument(post: {
  readonly content: string;
  readonly metadata: SocialPostMetadata;
}): string {
  const encoded = socialPostMarkdown.encode?.(post);
  return generateMarkdown(
    encoded?.frontmatter ?? socialPostFrontmatter(post.metadata),
    encoded?.content ?? post.content,
  );
}

/**
 * A post as a site reads it, as the social post data source read it: its
 * record, its content the document it is stored as, its frontmatter and
 * its text. A declared post's content is its text and its frontmatter its
 * metadata; a stored document carries its frontmatter in its content.
 */
export function socialPostWithData(entity: SocialPost): SocialPostWithData {
  const { fields, body } = recordFields(entity);
  const stored =
    Object.keys(parseMarkdown(entity.content).frontmatter).length > 0;
  return socialPostWithDataSchema.parse({
    ...entity,
    content: stored ? entity.content : socialPostDocument(entity),
    frontmatter: socialPostFrontmatterSchema.parse(fields),
    body,
  });
}

/**
 * The placeholder system_generate writes before the generation fills it,
 * as the social post adapter built it: a LinkedIn post being generated.
 */
export function socialPostStub(input: {
  readonly id: string;
  readonly title: string;
}): { content: string; metadata: SocialPostMetadata } {
  return {
    content: "",
    metadata: {
      title: input.title,
      platform: "linkedin",
      status: "generating",
      slug: socialPostSlug("linkedin", input.title),
    },
  };
}
