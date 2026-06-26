import { z } from "@brains/utils/zod-v4";
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

const paginationInfoSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

const contentVisibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

const platformSchema = z.enum(["linkedin"]);
const socialPostStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);
const sourceEntityTypeSchema = z.enum(["post", "deck"]);

const socialPostDocumentAttachmentSchema = z.object({
  id: z.string().min(1),
});

const socialPostFrontmatterSchema = z.object({
  title: z.string(),
  platform: platformSchema,
  status: socialPostStatusSchema,
  coverImageId: z.string().optional(),
  documents: z.array(socialPostDocumentAttachmentSchema).optional(),
  publishedAt: z.string().optional(),
  platformPostId: z.string().optional(),
  sourceEntityId: z.string().optional(),
  sourceEntityType: sourceEntityTypeSchema.optional(),
});

const socialPostMetadataSchema = z.object({
  title: z.string(),
  platform: platformSchema,
  status: socialPostStatusSchema,
  publishedAt: z.string().optional(),
  platformPostId: z.string().optional(),
  slug: z.string(),
  error: z.string().optional(),
});

const enrichedSocialPostSchema = z.object({
  id: z.string(),
  entityType: z.literal("social-post"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: socialPostMetadataSchema,
  contentHash: z.string(),
  frontmatter: socialPostFrontmatterSchema,
  body: z.string(),
  url: z.string().optional(),
  listUrl: z.string().optional(),
  listLabel: z.string().optional(),
  typeLabel: z.string().optional(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
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
