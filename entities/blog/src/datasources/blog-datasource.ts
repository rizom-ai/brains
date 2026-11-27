import {
  compareBySeriesPosition,
  getSeriesName,
  type JsonObject,
} from "@brains/contracts";
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

/**
 * A post as a site reads it. Its series name and its place in the series are
 * worked out here for the templates; the stored post holds only its group.
 */
type BlogPostTransformed = Omit<
  BlogPostWithData,
  "frontmatter" | "metadata"
> & {
  frontmatter: BlogPostWithData["frontmatter"] & SeriesPlace;
  metadata: BlogPostWithData["metadata"] & SeriesPlace;
  seriesUrl?: string;
};

interface SeriesPlace {
  seriesName?: string;
  seriesIndex?: number;
}

/** Most posts read to find a post's series. */
const READ_LIMIT = 1000;

/** Most posts a series shows. */
const SERIES_LIMIT = 100;

/** A post as a site reads it, with its series page when it is in one. */
function postData(entity: EntityOf<PostDefinition>): BlogPostTransformed {
  const post = postWithData(entity);
  const seriesName = getSeriesName(entity);
  if (!seriesName) return post;
  return {
    ...post,
    frontmatter: { ...post.frontmatter, seriesName },
    metadata: { ...post.metadata, seriesName },
    seriesUrl: `/series/${slugify(seriesName)}`,
  };
}

/** A post with its place in its series, counted among the posts read. */
function withSeriesPlace(
  post: BlogPostTransformed,
  posts: readonly EntityOf<PostDefinition>[],
): BlogPostTransformed {
  const name = post.frontmatter.seriesName;
  if (!name) return post;
  const place =
    posts
      .filter((entry) => getSeriesName(entry) === name)
      .sort(compareBySeriesPosition)
      .findIndex((entry) => entry.id === post.id) + 1;
  if (place === 0) return post;
  return {
    ...post,
    frontmatter: { ...post.frontmatter, seriesIndex: place },
    metadata: { ...post.metadata, seriesIndex: place },
  };
}

/** The posts in a series, in their place in it. */
function seriesPosts(
  posts: readonly EntityOf<PostDefinition>[],
  seriesName: string,
): BlogPostTransformed[] {
  return posts
    .filter((entry) => getSeriesName(entry) === seriesName)
    .sort(compareBySeriesPosition)
    .slice(0, SERIES_LIMIT)
    .map((entry, index) => {
      const data = postData(entry);
      return {
        ...data,
        frontmatter: { ...data.frontmatter, seriesIndex: index + 1 },
        metadata: { ...data.metadata, seriesIndex: index + 1 },
      };
    });
}

/** Every post, read once, to place posts in their series. */
async function everyPost(
  post: PostDefinition,
  entities: EntityReader,
): Promise<readonly EntityOf<PostDefinition>[]> {
  return entities.list(post, { limit: READ_LIMIT });
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
    list: async (items, pagination, query, { entities }) => {
      const inSeries = items.some((item) => item.frontmatter.seriesName);
      const posts = inSeries ? await everyPost(post, entities) : [];
      return {
        posts: items.map((item) =>
          blogViewSchema.parse(withSeriesPlace(item, posts)),
        ),
        pagination,
        baseUrl: query.baseUrl ?? null,
      };
    },
    detail: async ({ item, navigation, entities }) => {
      const name = item.frontmatter.seriesName;
      const posts = name ? await everyPost(post, entities) : [];
      return {
        post: withSeriesPlace(item, posts),
        prevPost: navigation?.prev ?? null,
        nextPost: navigation?.next ?? null,
        seriesPosts: name ? seriesPosts(posts, name) : null,
      };
    },
  });
}
