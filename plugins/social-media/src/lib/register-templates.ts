import type { ServicePluginContext } from "@brains/plugins";
import { paginationInfoSchema } from "@brains/plugins";
import { z } from "@brains/utils";
import { createTemplate } from "@brains/templates";
import { enrichedSocialPostSchema } from "../schemas/social-post";
import { linkedinTemplate } from "../templates/linkedin-template";
import {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "../templates/social-post-list";
import {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "../templates/social-post-detail";

export function registerTemplates(context: ServicePluginContext): void {
  context.templates.register({
    linkedin: linkedinTemplate,
  });

  const postListSchema = z.object({
    posts: z.array(enrichedSocialPostSchema),
    totalCount: z.number().optional(),
    pagination: paginationInfoSchema.nullable(),
    baseUrl: z.string().optional(),
  });

  const postDetailSchema = z.object({
    post: enrichedSocialPostSchema,
  });

  context.templates.register({
    "social-post-list": createTemplate<
      z.infer<typeof postListSchema>,
      SocialPostListProps
    >({
      name: "social-post-list",
      description: "Social post list page template",
      schema: postListSchema,
      dataSourceId: "social-media:posts",
      requiredPermission: "public",
      layout: {
        component: SocialPostListTemplate,
        interactive: false,
      },
    }),
    "social-post-detail": createTemplate<
      z.infer<typeof postDetailSchema>,
      SocialPostDetailProps
    >({
      name: "social-post-detail",
      description: "Individual social post template",
      schema: postDetailSchema,
      dataSourceId: "social-media:posts",
      requiredPermission: "public",
      layout: {
        component: SocialPostDetailTemplate,
        interactive: false,
      },
    }),
  });
}
