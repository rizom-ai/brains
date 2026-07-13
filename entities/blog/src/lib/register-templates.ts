import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { BlogListTemplate, type BlogListProps } from "../templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "../templates/blog-post";
import { blogGenerationTemplate } from "../templates/generation-template";
import { blogExcerptTemplate } from "../templates/excerpt-template";
import { homepageTemplate } from "../templates/homepage";
import { enrichedBlogPostSchema } from "../schemas/blog-post";

const paginationInfoSchema = z.object({
  currentPage: z.number(),
  totalPages: z.number(),
  totalItems: z.number(),
  pageSize: z.number(),
  hasNextPage: z.boolean(),
  hasPrevPage: z.boolean(),
});

/**
 * Datasources return posts before site-builder adds route/display fields.
 * Keep those enrichment fields optional here; createTemplate casts to the
 * fully enriched component props after the site-builder enrichment pass.
 */
const postListSchema = z.object({
  posts: z.array(enrichedBlogPostSchema),
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
        post: z.output<typeof enrichedBlogPostSchema>;
        prevPost: z.output<typeof enrichedBlogPostSchema> | null;
        nextPost: z.output<typeof enrichedBlogPostSchema> | null;
        seriesPosts: z.output<typeof enrichedBlogPostSchema>[] | null;
      },
      BlogPostProps
    >({
      name: "post-detail",
      description: "Individual blog post template",
      schema: z.object({
        post: enrichedBlogPostSchema,
        prevPost: enrichedBlogPostSchema.nullable(),
        nextPost: enrichedBlogPostSchema.nullable(),
        seriesPosts: z.array(enrichedBlogPostSchema).nullable(),
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
