import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import type { FeedItem } from "@brains/site-composition";
import { blogPostFrontmatterSchema, type BlogPost } from "../schemas/blog-post";

/**
 * How a post becomes a feed item.
 *
 * A post with no publication date is not syndicated: a reader orders by
 * date, and an item without one would sort arbitrarily. Whether unpublished
 * posts reach here at all is the site build's call — it knows whether this
 * is a preview.
 */
export function postToFeedItem(post: BlogPost): FeedItem | null {
  const parsed = parseMarkdownWithFrontmatter(
    post.content,
    blogPostFrontmatterSchema,
  );
  const frontmatter = parsed.metadata;
  const publishedAt = frontmatter.publishedAt ?? post.created;
  if (!publishedAt) return null;

  return {
    title: frontmatter.title,
    slug: post.metadata.slug,
    description: frontmatter.excerpt,
    content: parsed.content,
    author: frontmatter.author,
    publishedAt,
    ...(frontmatter.seriesName === undefined
      ? {}
      : { category: frontmatter.seriesName }),
  };
}
