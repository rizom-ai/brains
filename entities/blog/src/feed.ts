import type { FeedItem } from "@brains/site-composition";
import type {
  EntityFeedBuild,
  EntityFeedDeclaration,
  EntityDefinition,
  EntityOf,
} from "@brains/sdk/entities";
import type { blogPostMetadataSchema } from "./schemas/blog-post";

type PostRecord = EntityOf<
  EntityDefinition<"post", typeof blogPostMetadataSchema>
>;

/**
 * A post as a feed item: its title, excerpt, body and author, dated when
 * it was published, else when it was written, its series as the category.
 * A production feed carries a post only once it is published and dated, as
 * the blog plugin class's feed did; a preview carries every post.
 */
export function postFeedItem(
  post: PostRecord,
  { environment }: EntityFeedBuild,
): FeedItem | null {
  const { metadata } = post;
  if (
    environment === "production" &&
    (metadata.status !== "published" || !metadata.publishedAt)
  ) {
    return null;
  }
  return {
    title: metadata.title,
    slug: metadata.slug,
    description: metadata.excerpt,
    content: post.content,
    author: metadata.author,
    publishedAt: metadata.publishedAt ?? post.created,
    ...(metadata.seriesName && { category: metadata.seriesName }),
  };
}

/** The blog's feed.xml, written into every site build. */
export const postFeed: EntityFeedDeclaration<PostRecord> = {
  path: "feed.xml",
  title: "Blog",
  description: "Latest blog posts",
  toItem: postFeedItem,
};
