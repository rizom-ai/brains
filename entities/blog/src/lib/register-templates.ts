import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod-v4";
import { BlogListTemplate, type BlogListProps } from "../templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "../templates/blog-post";
import { blogGenerationTemplate } from "../templates/generation-template";
import { blogExcerptTemplate } from "../templates/excerpt-template";
import { homepageTemplate } from "../templates/homepage";
import { templateBlogPostSchema } from "../templates/template-blog-post-schema";

const paginationInfoSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

const postListSchema = z.object({
  posts: z.array(templateBlogPostSchema),
  pageTitle: z.string().optional(),
  pageLabel: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

export function getTemplates(): Record<string, Template> {
  return {
    "post-list": createTemplate<z.output<typeof postListSchema>, BlogListProps>(
      {
        name: "post-list",
        description: "Blog list page template",
        schema: postListSchema,
        dataSourceId: "blog:entities",
        requiredPermission: "public",
        layout: {
          component: BlogListTemplate,
        },
      },
    ),
    "post-detail": createTemplate<
      {
        post: z.output<typeof templateBlogPostSchema>;
        prevPost: z.output<typeof templateBlogPostSchema> | null;
        nextPost: z.output<typeof templateBlogPostSchema> | null;
        seriesPosts: z.output<typeof templateBlogPostSchema>[] | null;
      },
      BlogPostProps
    >({
      name: "post-detail",
      description: "Individual blog post template",
      schema: z.object({
        post: templateBlogPostSchema,
        prevPost: templateBlogPostSchema.nullable(),
        nextPost: templateBlogPostSchema.nullable(),
        seriesPosts: z.array(templateBlogPostSchema).nullable(),
      }),
      dataSourceId: "blog:entities",
      requiredPermission: "public",
      layout: {
        component: BlogPostTemplate,
      },
    }),
    homepage: homepageTemplate,
    generation: blogGenerationTemplate,
    excerpt: blogExcerptTemplate,
  };
}
