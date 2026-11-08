import type { JsonObject } from "@brains/contracts";
import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
  type EntityOf,
  type EntityReader,
} from "@brains/sdk/entities";
import { slugify } from "@brains/utils/string-utils";
import { postWithData } from "../lib/post-markdown";
import type {
  BlogPostWithData,
  blogPostMetadataSchema,
} from "../schemas/blog-post";
import { blogViewSchema } from "../templates/blog-view-schema";

// Re-export for convenience
export type { BlogPostWithData };

type PostDefinition = EntityDefinition<"post", typeof blogPostMetadataSchema>;

type BlogPostTransformed = BlogPostWithData & { seriesUrl?: string };

/** Most posts read to find a post's series. */
const READ_LIMIT = 1000;

/** Most posts a series shows. */
const SERIES_LIMIT = 100;

/** A post as a site reads it, with its series page when it is in one. */
function postData(entity: EntityOf<PostDefinition>): BlogPostTransformed {
  const post = postWithData(entity);
  const seriesName = post.frontmatter.seriesName;
  const seriesUrl = seriesName ? `/series/${slugify(seriesName)}` : undefined;
  return { ...post, ...(seriesUrl && { seriesUrl }) };
}

/** The posts in a series, by their place in it, as the class listed them. */
async function seriesPosts(
  post: PostDefinition,
  entities: EntityReader,
  seriesName: string,
): Promise<BlogPostTransformed[]> {
  const listed = await entities.list(post, {
    limit: READ_LIMIT,
    sort: [{ field: "seriesIndex", direction: "asc" }],
  });
  return listed
    .filter((entry) => entry.metadata.seriesName === seriesName)
    .slice(0, SERIES_LIMIT)
    .map(postData);
}

/**
 * Fetches and transforms posts for rendering: a paged list, newest
 * published first, or one post by its slug with its neighbors and the
 * other posts in its series.
 */
export function blogDataSource(
  post: PostDefinition,
): EntityDataSourceDefinition<PostDefinition, BlogPostTransformed, JsonObject> {
  return defineDataSource({
    id: "entities",
    name: "Blog Entity DataSource",
    description: "Fetches and transforms blog post entities for rendering",
    entity: post,
    defaultSort: [{ field: "publishedAt", direction: "desc" }],
    defaultLimit: 10,
    enableNavigation: true,
    transform: postData,
    list: (items, pagination, query) => ({
      posts: items.map((item) => blogViewSchema.parse(item)),
      pagination,
      baseUrl: query.baseUrl ?? null,
    }),
    detail: async ({ item, navigation, entities }) => ({
      post: item,
      prevPost: navigation?.prev ?? null,
      nextPost: navigation?.next ?? null,
      seriesPosts: item.frontmatter.seriesName
        ? await seriesPosts(post, entities, item.frontmatter.seriesName)
        : null,
    }),
  });
}
