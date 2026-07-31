import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { paginationInfoSchema } from "@brains/plugins";
import { BlogListTemplate, type BlogListProps } from "../templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "../templates/blog-post";
import { blogGenerationTemplate } from "../templates/generation-template";
import { blogExcerptTemplate } from "../templates/excerpt-template";
import { homepageTemplate } from "../templates/homepage";
import {
  blogViewSchema,
  type BlogSchemaData,
} from "../templates/blog-view-schema";

/**
 * Datasources return posts before site-builder adds route/display fields.
 * Keep those enrichment fields optional here; createTemplate casts to the
 * fully enriched component props after the site-builder enrichment pass.
 */
const postListSchema = z.object({
  posts: z.array(blogViewSchema),
  pageTitle: z.string().nullable().default(null),
  pageLabel: z.string().nullable().default(null),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().nullable().default(null),
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
        post: BlogSchemaData;
        prevPost: BlogSchemaData | null;
        nextPost: BlogSchemaData | null;
        seriesPosts: BlogSchemaData[] | null;
      },
      BlogPostProps
    >({
      name: "post-detail",
      description: "Individual blog post template",
      schema: z.object({
        post: blogViewSchema,
        prevPost: blogViewSchema.nullable(),
        nextPost: blogViewSchema.nullable(),
        seriesPosts: z.array(blogViewSchema).nullable(),
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
