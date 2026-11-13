import { frontmatterRecordFields } from "@brains/contracts";
import type { EntityMarkdownCodec } from "@brains/sdk/entities";
import {
  generateMarkdown,
  parseMarkdown,
} from "@brains/utils/markdown-frontmatter";
import { slugify } from "@brains/utils/string-utils";
import {
  blogPostFrontmatterSchema,
  blogPostWithDataSchema,
  type BlogPost,
  type BlogPostMetadata,
  type BlogPostWithData,
  type blogPostMetadataSchema,
} from "../schemas/blog-post";
import { definedFields } from "@brains/utils/strip-undefined";

/**
 * A post's frontmatter, in the order the blog post adapter wrote it: its
 * fields in schema order, the slug among them when the file states it and
 * after them when it was resolved from the title, then the error a failed
 * generation recorded.
 */
export function postFrontmatter(
  metadata: BlogPostMetadata,
): Record<string, unknown> {
  const authored = metadata.authoredSlug === true;
  return definedFields({
    title: metadata.title,
    ...(authored && { slug: metadata.slug }),
    status: metadata.status,
    publishedAt: metadata.publishedAt,
    excerpt: metadata.excerpt,
    author: metadata.author,
    coverImageId: metadata.coverImageId,
    ogImageId: metadata.ogImageId,
    seriesName: metadata.seriesName,
    seriesIndex: metadata.seriesIndex,
    ogImage: metadata.ogImage,
    canonicalUrl: metadata.canonicalUrl,
    ...(!authored && { slug: metadata.slug }),
    error: metadata.error,
  });
}

/** A post as its stored document: its frontmatter and its body. */
export function postDocument(post: {
  readonly content: string;
  readonly metadata: BlogPostMetadata;
}): string {
  return generateMarkdown(postFrontmatter(post.metadata), post.content);
}

/**
 * A post's frontmatter is its metadata, the slug resolved from the title
 * when the file states none; its body is the post, as written.
 */
export const postMarkdown: EntityMarkdownCodec<typeof blogPostMetadataSchema> =
  {
    decode: ({ content, frontmatter }) => {
      const parsed = blogPostFrontmatterSchema.parse(frontmatter);
      const error = frontmatter["error"];
      return {
        content,
        metadata: {
          ...parsed,
          slug: parsed.slug ?? slugify(parsed.title),
          ...(parsed.slug !== undefined && { authoredSlug: true }),
          ...(typeof error === "string" && { error }),
        },
      };
    },
    // A whole document handed in has had its frontmatter decoded into the
    // metadata already; the body is written as the adapter wrote it.
    encode: ({ content, metadata }) => ({
      content: parseMarkdown(content).content,
      frontmatter: postFrontmatter(metadata),
    }),
  };

/**
 * A post as a site reads it, as the blog plugin class's data source read
 * it: its record, its content the document it is stored as, so the site
 * finds the images its frontmatter names, its frontmatter and its body.
 * A declared post's content is its body and its frontmatter its metadata;
 * a stored document carries its frontmatter in its content.
 */
export function postWithData(entity: BlogPost): BlogPostWithData {
  const { fields, body } = frontmatterRecordFields(entity);
  const stored =
    Object.keys(parseMarkdown(entity.content).frontmatter).length > 0;
  return blogPostWithDataSchema.parse({
    ...entity,
    content: stored ? entity.content : postDocument(entity),
    frontmatter: blogPostFrontmatterSchema.parse(fields),
    body,
  });
}

/**
 * The placeholder system_generate and a post from the writer's text write
 * before the generation fills it, as the blog post adapter built it.
 */
export function postStub(input: {
  readonly id: string;
  readonly title: string;
}): {
  content: string;
  metadata: BlogPostMetadata;
} {
  return {
    content: "",
    metadata: {
      title: input.title,
      slug: input.id,
      authoredSlug: true,
      status: "generating",
      excerpt: "",
      author: "AI",
    },
  };
}
