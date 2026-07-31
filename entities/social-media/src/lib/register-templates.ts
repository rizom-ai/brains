import { z } from "@brains/utils/zod";
import { paginationInfoSchema } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { linkedinTemplate } from "../templates/linkedin-template";
import {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "../templates/social-post-list";
import {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "../templates/social-post-detail";
import { socialPostViewSchema } from "../templates/social-post-view";

const enrichedSocialPostSchema = socialPostViewSchema;

const postListSchema = z.object({
  posts: z.array(enrichedSocialPostSchema),
  totalCount: z.number().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
});

const postDetailSchema = z.object({
  post: enrichedSocialPostSchema,
});

export function getTemplates(): Record<string, Template> {
  return {
    linkedin: linkedinTemplate,
    "social-post-list": createTemplate<
      z.output<typeof postListSchema>,
      SocialPostListProps
    >({
      name: "social-post-list",
      description: "Social post list page template",
      schema: postListSchema,
      dataSourceId: "social-media:posts",
      requiredPermission: "public",
      layout: {
        component: SocialPostListTemplate,
      },
    }),
    "social-post-detail": createTemplate<
      z.output<typeof postDetailSchema>,
      SocialPostDetailProps
    >({
      name: "social-post-detail",
      description: "Individual social post template",
      schema: postDetailSchema,
      dataSourceId: "social-media:posts",
      requiredPermission: "public",
      layout: {
        component: SocialPostDetailTemplate,
      },
    }),
  };
}
