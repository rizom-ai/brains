import {
  defineDataSource,
  z,
  type DataSourceDefinition,
  type EntityDefinition,
  type EntityOf,
  type EntityReader,
} from "@brains/sdk/entities";
import type { PaginationInfo } from "@brains/sdk/internal/presentation";
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
type Post = EntityOf<PostDefinition>;

type BlogPostTransformed = BlogPostWithData & { seriesUrl?: string };

const blogInputSchema = z.looseObject({
  entityType: z.string().optional(),
  query: z
    .looseObject({
      id: z.string().optional(),
      limit: z.number().optional(),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      baseUrl: z.string().optional(),
      latest: z.boolean().optional(),
      "metadata.seriesName": z.string().optional(),
    })
    .optional(),
});

type BlogQuery = NonNullable<z.output<typeof blogInputSchema>["query"]>;

/** Newest published first, as posts list everywhere. */
const BY_PUBLICATION: NonNullable<Parameters<EntityReader["list"]>[1]>["sort"] =
  [{ field: "publishedAt", direction: "desc" }];

/** Posts per list page when the query names no page size. */
const DEFAULT_LIMIT = 10;

/** Most posts read to resolve a post, its neighbours or its series. */
const READ_LIMIT = 1000;

/** Most posts a series shows. */
const SERIES_LIMIT = 100;

/** A post as a site reads it, with its series page when it is in one. */
function postData(entity: Post): BlogPostTransformed {
  const post = postWithData(entity);
  const seriesName = post.frontmatter.seriesName;
  const seriesUrl = seriesName ? `/series/${slugify(seriesName)}` : undefined;
  return { ...post, ...(seriesUrl && { seriesUrl }) };
}

function paginationInfo(
  totalItems: number,
  currentPage: number,
  pageSize: number,
): PaginationInfo {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return {
    currentPage,
    totalPages,
    totalItems,
    pageSize,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
  };
}

interface PostPage {
  readonly items: BlogPostTransformed[];
  readonly pagination: PaginationInfo | null;
}

interface Neighbours {
  readonly prev: BlogPostTransformed | null;
  readonly next: BlogPostTransformed | null;
}

/**
 * The posts and the reads over them, at the build's scope, in the order and
 * pages the blog plugin class's data source read them.
 */
class PostReads {
  private readonly post: PostDefinition;
  private readonly entities: EntityReader;

  constructor(post: PostDefinition, entities: EntityReader) {
    this.post = post;
    this.entities = entities;
  }

  private ordered(limit = READ_LIMIT): Promise<readonly Post[]> {
    return this.entities.list(this.post, { limit, sort: BY_PUBLICATION });
  }

  async page(query: BlogQuery): Promise<PostPage> {
    const currentPage = query.page ?? 1;
    const pageSize = query.pageSize ?? query.limit ?? DEFAULT_LIMIT;
    const paginated = query.page !== undefined;
    const [items, total] = await Promise.all([
      this.entities.list(this.post, {
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        sort: BY_PUBLICATION,
      }),
      paginated ? this.entities.count(this.post) : Promise.resolve(0),
    ]);
    return {
      items: items.map(postData),
      pagination: paginated
        ? paginationInfo(total, currentPage, pageSize)
        : null,
    };
  }

  async bySlug(slug: string): Promise<Post> {
    const found = (await this.ordered()).find(
      (entry) => entry.metadata.slug === slug,
    );
    if (!found) throw new Error(`post not found with slug: ${slug}`);
    return found;
  }

  async neighbours(entity: Post): Promise<Neighbours> {
    const all = await this.ordered();
    const index = all.findIndex((entry) => entry.id === entity.id);
    const prev = index > 0 ? all[index - 1] : undefined;
    const next = index < all.length - 1 ? all[index + 1] : undefined;
    return {
      prev: prev ? postData(prev) : null,
      next: next ? postData(next) : null,
    };
  }

  async series(seriesName: string): Promise<BlogPostTransformed[]> {
    const all = await this.entities.list(this.post, {
      limit: READ_LIMIT,
      sort: [{ field: "seriesIndex", direction: "asc" }],
    });
    return all
      .filter((entry) => entry.metadata.seriesName === seriesName)
      .slice(0, SERIES_LIMIT)
      .map(postData);
  }

  async latest(): Promise<Post | undefined> {
    const [newest] = await this.ordered(1);
    return newest;
  }
}

/**
 * Fetches and transforms posts for rendering, as the blog plugin class's
 * data source did: a paged list, newest published first; one post by its
 * slug with its neighbours and the other posts in its series; the latest
 * post with its series; or the posts in a series by their place in it.
 */
export function blogDataSource(post: PostDefinition): DataSourceDefinition {
  return defineDataSource({
    id: "entities",
    name: "Blog Entity DataSource",
    description: "Fetches and transforms blog post entities for rendering",
    fetch: async (input, entities) => {
      const query = blogInputSchema.parse(input).query ?? {};
      const reads = new PostReads(post, entities);

      if (query.latest) {
        const latest = await reads.latest();
        // The homepage falls back to its own content.
        if (!latest) throw new Error("NO_PUBLISHED_POSTS");
        const seriesName = latest.metadata.seriesName;
        return {
          post: postData(latest),
          prevPost: null,
          nextPost: null,
          seriesPosts: seriesName ? await reads.series(seriesName) : null,
        };
      }

      if (query.id) {
        const entity = await reads.bySlug(query.id);
        const item = postData(entity);
        const seriesName = item.frontmatter.seriesName;
        const [neighbours, seriesPosts] = await Promise.all([
          reads.neighbours(entity),
          seriesName ? reads.series(seriesName) : Promise.resolve(null),
        ]);
        return {
          post: item,
          prevPost: neighbours.prev,
          nextPost: neighbours.next,
          seriesPosts,
        };
      }

      const seriesName = query["metadata.seriesName"];
      if (seriesName) {
        return { seriesName, posts: await reads.series(seriesName) };
      }

      const { items, pagination } = await reads.page(query);
      return {
        posts: items.map((item) => blogViewSchema.parse(item)),
        pagination,
        baseUrl: query.baseUrl ?? null,
      };
    },
  });
}
