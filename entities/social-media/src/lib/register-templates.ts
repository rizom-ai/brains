import { z } from "@brains/sdk/entities";
import { createTemplate, paginationInfoSchema } from "@brains/sdk/entities";
import type { Template } from "@brains/sdk/entities";
import { linkedinTemplate } from "../templates/linkedin-template";
import {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "../templates/social-post-list";
import {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "../templates/social-post-detail";
import {
  socialPostRenderSchema,
  socialPostViewSchema,
} from "../templates/social-post-view";

const enrichedSocialPostSchema = socialPostViewSchema;

/**
 * What a post looks like once site-builder has filled the link fields the
 * datasource leaves null. Components read these as required, so the render
 * path parses against this rather than trusting the enrichment ran.
 */
const renderedSocialPostSchema = socialPostRenderSchema;

const postListRenderSchema = z.object({
  posts: z.array(renderedSocialPostSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable().optional(),
  baseUrl: z.string().nullable(),
});

const postDetailRenderSchema = z.object({
  post: renderedSocialPostSchema,
});

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
      dataSourceId: "posts",
      requiredPermission: "public",
      layout: {
        component: SocialPostListTemplate,
        renderSchema: postListRenderSchema,
      },
    }),
    "social-post-detail": createTemplate<
      z.output<typeof postDetailSchema>,
      SocialPostDetailProps
    >({
      name: "social-post-detail",
      description: "Individual social post template",
      schema: postDetailSchema,
      dataSourceId: "posts",
      requiredPermission: "public",
      layout: {
        component: SocialPostDetailTemplate,
        renderSchema: postDetailRenderSchema,
      },
    }),
  };
}
