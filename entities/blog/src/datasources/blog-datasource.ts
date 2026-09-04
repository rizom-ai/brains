import {
  defineDataSource,
  defineEntityDataSource,
  type DataSourceDefinition,
  type EntityDataSourceDefinition,
  type EntityQueryReader,
  type PaginationInfo,
} from "@brains/sdk/entities";
import { slugify } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";
import type { BlogPost, BlogPostWithData } from "../schemas/blog-post";
import { blogPostSchema } from "../schemas/blog-post";
import { parsePostData as parsePostDataBase } from "./parse-helpers";
import {
  blogViewSchema,
  type BlogSchemaData,
} from "../templates/blog-view-schema";

// Re-export for convenience
export type { BlogPostWithData };

export type BlogPostTransformed = BlogPostWithData & { seriesUrl?: string };

export function parsePostData(entity: BlogPost): BlogPostTransformed {
  const post = parsePostDataBase(entity);
  const seriesName = post.frontmatter.seriesName;
  const seriesUrl = seriesName ? `/series/${slugify(seriesName)}` : undefined;
  return { ...post, ...(seriesUrl && { seriesUrl }) };
}

async function postsInSeries(
  seriesName: string,
  entities: EntityQueryReader,
): Promise<BlogPostTransformed[]> {
  const found = await entities.listEntities(
    {
      entityType: "post",
      options: {
        limit: 100,
        filter: { metadata: { seriesName } },
        sortFields: [{ field: "seriesIndex", direction: "asc" }],
      },
    },
    blogPostSchema,
  );
  return found.map(parsePostData);
}

/**
 * Posts as a list, and one post with its neighbours and series context.
 *
 * The detail view reads entities because a post's siblings in its series
 * are not its siblings in the feed order the list uses.
 */
export const blogDataSource: EntityDataSourceDefinition<
  BlogPost,
  BlogPostTransformed,
  {
    posts: BlogSchemaData[];
    pagination: PaginationInfo | null;
    baseUrl: string | null;
  }
> = defineEntityDataSource({
  id: "entities",
  name: "Blog Entity DataSource",
  description: "Fetches and transforms blog post entities for rendering",
  entityType: "post",
  entitySchema: blogPostSchema,
  defaultSort: [{ field: "publishedAt", direction: "desc" }],
  defaultLimit: 10,
  enableNavigation: true,
  transform: (entity: BlogPost): BlogPostTransformed => parsePostData(entity),
  list: (items: BlogPostTransformed[], pagination, query) => ({
    posts: items.map((item) => blogViewSchema.parse(item)),
    pagination,
    baseUrl: query.baseUrl ?? null,
  }),
  detail: async ({ item, navigation, entities }) => {
    const seriesName = item.frontmatter.seriesName;
    return {
      post: item,
      prevPost: navigation?.prev ?? null,
      nextPost: navigation?.next ?? null,
      seriesPosts: seriesName
        ? await postsInSeries(seriesName, entities)
        : null,
    };
  },
});

const latestQuerySchema = z.looseObject({});

/**
 * The most recent published post, in the same shape as a detail view so a
 * homepage can render it with the detail template.
 */
export const blogLatestDataSource: DataSourceDefinition = defineDataSource({
  id: "latest",
  name: "Latest Blog Post DataSource",
  description: "Fetches the most recently published post",
  fetch: async (query, entities) => {
    latestQuerySchema.parse(query ?? {});
    const published = await entities.listEntities(
      {
        entityType: "post",
        options: {
          limit: 1,
          sortFields: [{ field: "publishedAt", direction: "desc" }],
        },
      },
      blogPostSchema,
    );

    const latest = published[0];
    // A brain with no posts yet is not an error the page can render around,
    // so this stays the sentinel the caller already handles.
    if (!latest) throw new Error("NO_PUBLISHED_POSTS");

    const post = parsePostData(latest);
    const seriesName = post.frontmatter.seriesName;
    return {
      post,
      prevPost: null,
      nextPost: null,
      seriesPosts: seriesName
        ? await postsInSeries(seriesName, entities)
        : null,
    };
  },
});

const seriesQuerySchema = z.looseObject({
  seriesName: z.string(),
  baseUrl: z.string().optional(),
});

/** Every post in one series, in reading order. */
export const blogSeriesDataSource: DataSourceDefinition = defineDataSource({
  id: "series",
  name: "Blog Series DataSource",
  description: "Fetches the posts of one series in reading order",
  fetch: async (query, entities) => {
    const params = seriesQuerySchema.parse(query ?? {});
    const posts = await postsInSeries(params.seriesName, entities);
    return {
      seriesName: params.seriesName,
      posts: posts.map((post) => blogViewSchema.parse(post)),
      pagination: null,
      baseUrl: params.baseUrl ?? null,
    };
  },
});
