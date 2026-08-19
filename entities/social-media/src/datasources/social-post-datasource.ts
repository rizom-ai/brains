import {
  defineEntityDataSource,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type {
  EntityDataSourceDefinition,
  PaginationInfo,
} from "@brains/plugins";
import type { SocialPost } from "../schemas/social-post";
import {
  socialPostFrontmatterSchema,
  socialPostWithDataSchema,
  type SocialPostWithData,
} from "../schemas/social-post";
import {
  socialPostViewSchema,
  type SocialPostSchemaData,
} from "../templates/social-post-view";

/**
 * Parse frontmatter and extract body from entity.
 */
export function parsePostData(entity: SocialPost): SocialPostWithData {
  const parsed = parseMarkdownWithFrontmatter(
    entity.content,
    socialPostFrontmatterSchema,
  );

  return socialPostWithDataSchema.parse({
    ...entity,
    frontmatter: parsed.metadata,
    body: parsed.content,
  });
}

/**
 * Social posts, published first and newest first within that.
 *
 * The class this replaces also served `nextInQueue` and a `sortByQueue`
 * ordering. Neither had a caller — no template queried them and no tool
 * reached them — so they are not carried forward.
 */
export const socialPostDataSource: EntityDataSourceDefinition<
  SocialPost,
  SocialPostWithData,
  {
    posts: SocialPostSchemaData[];
    totalCount: number;
    pagination: PaginationInfo | null;
    baseUrl: string | null;
  }
> = defineEntityDataSource({
  id: "posts",
  name: "Social Post DataSource",
  description: "Fetches and transforms social post entities for rendering",
  entityType: "social-post",
  defaultSort: [
    { field: "publishedAt", direction: "desc", nullsFirst: true },
    { field: "created", direction: "desc" },
  ],
  defaultLimit: 100,
  transform: (entity: SocialPost): SocialPostWithData => parsePostData(entity),
  list: (items: SocialPostWithData[], pagination, query) => ({
    posts: items.map((item) => socialPostViewSchema.parse(item)),
    totalCount: pagination?.totalItems ?? items.length,
    pagination,
    baseUrl: query.baseUrl ?? null,
  }),
  detail: ({ item }) => ({ post: item }),
});
