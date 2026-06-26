import { z } from "@brains/utils/zod-v4";

const contentVisibilitySchema = z
  .union([z.enum(["public", "shared", "restricted"]), z.literal("private")])
  .optional()
  .transform((value) => {
    if (value === undefined) return "public";
    if (value === "private") return "restricted";
    return value;
  });

const baseEntitySchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: z.record(z.string(), z.unknown()),
  contentHash: z.string(),
});

const blogPostStatusSchema = z.enum([
  "generating",
  "draft",
  "queued",
  "published",
  "failed",
]);

const blogPostFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string().optional(),
  status: blogPostStatusSchema,
  publishedAt: z.string().optional(),
  excerpt: z.string(),
  author: z.string(),
  coverImageId: z.string().optional(),
  ogImageId: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  ogImage: z.url().optional(),
  ogDescription: z.string().optional(),
  twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
  canonicalUrl: z.url().optional(),
  atprotoUri: z.string().optional(),
});

const blogPostMetadataSchema = z.object({
  title: z.string(),
  status: blogPostStatusSchema,
  publishedAt: z.string().optional(),
  seriesName: z.string().optional(),
  seriesIndex: z.number().optional(),
  slug: z.string(),
  error: z.string().optional(),
});

const blogPostWithDataSchema = baseEntitySchema.extend({
  entityType: z.literal("post"),
  metadata: blogPostMetadataSchema,
  frontmatter: blogPostFrontmatterSchema,
  body: z.string(),
  coverImageUrl: z.string().optional(),
});

export const templateBlogPostSchema = blogPostWithDataSchema.extend({
  url: z.string(),
  typeLabel: z.string(),
  listUrl: z.string(),
  listLabel: z.string(),
  seriesUrl: z.string().optional(),
  coverImageUrl: z.string().optional(),
  ogImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
  coverImageSrcset: z.string().optional(),
  coverImageSizes: z.string().optional(),
});

export type TemplateBlogPost = z.output<typeof templateBlogPostSchema>;
