import {
  defineDataSource,
  type EntityDataSourceDefinition,
  type EntityDefinition,
} from "@brains/sdk/entities";
import type { PaginationInfo } from "@brains/sdk/internal/presentation";
import { z } from "@brains/utils/zod";
import { socialPostWithData } from "../lib/social-post-markdown";
import {
  platformSchema,
  socialPostStatusSchema,
  type SocialPostWithData,
  type socialPostMetadataSchema,
} from "../schemas/social-post";
import {
  socialPostViewSchema,
  type SocialPostSchemaData,
} from "../templates/social-post-view";

type SocialPostDefinition = EntityDefinition<
  "social-post",
  typeof socialPostMetadataSchema
>;

interface SocialPostListData {
  posts: SocialPostSchemaData[];
  totalCount: number;
  pagination: PaginationInfo | null;
  baseUrl: string | null;
}

/** The platform and status a list query may narrow by. */
const listFilterSchema = z.looseObject({
  platform: platformSchema.optional(),
  status: socialPostStatusSchema.optional(),
});

/**
 * Fetches and transforms social posts for rendering: a list, published
 * newest first and then unpublished newest first, narrowed by platform or
 * status when asked, or one post by its slug.
 */
export function socialPostDataSource(
  socialPost: SocialPostDefinition,
): EntityDataSourceDefinition<
  SocialPostDefinition,
  SocialPostWithData,
  SocialPostListData
> {
  return defineDataSource({
    id: "posts",
    name: "Social Post DataSource",
    description:
      "Fetches and transforms social post entities for queue management and publishing",
    entity: socialPost,
    defaultSort: [
      { field: "publishedAt", direction: "desc", nullsFirst: true },
      { field: "created", direction: "desc" },
    ],
    defaultLimit: 100,
    filter: (query) => {
      const { platform, status } = listFilterSchema.parse(query);
      const metadata = {
        ...(platform && { platform }),
        ...(status && { status }),
      };
      return Object.keys(metadata).length > 0 ? { metadata } : undefined;
    },
    transform: socialPostWithData,
    list: (items, pagination, query) => ({
      posts: items.map((item) => socialPostViewSchema.parse(item)),
      totalCount: pagination?.totalItems ?? items.length,
      pagination,
      baseUrl: query.baseUrl ?? null,
    }),
    detail: ({ item }) => ({ post: item }),
  });
}
