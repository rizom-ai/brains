import { paginationInfoSchema } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import { z } from "@brains/utils";
import { enrichedBlogPostSchema } from "../schemas/blog-post";
import { seriesListItemSchema } from "../schemas/series";
import { BlogListTemplate, type BlogListProps } from "../templates/blog-list";
import { BlogPostTemplate, type BlogPostProps } from "../templates/blog-post";
import {
  SeriesDetailTemplate,
  type SeriesDetailProps,
} from "../templates/series-detail";
import {
  SeriesListTemplate,
  type SeriesListProps,
} from "../templates/series-list";
import { blogGenerationTemplate } from "../templates/generation-template";
import { blogExcerptTemplate } from "../templates/excerpt-template";
import { seriesDescriptionTemplate } from "../templates/series-description-template";
import { homepageTemplate } from "../templates/homepage";

const postListSchema = z.object({
  posts: z.array(enrichedBlogPostSchema),
  pageTitle: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

const seriesDetailSchema = z.object({
  seriesName: z.string(),
  posts: z.array(enrichedBlogPostSchema),
  series: seriesListItemSchema,
  description: z.string().optional(),
});

export function registerTemplates(context: ServicePluginContext): void {
  context.templates.register({
    "post-list": createTemplate<z.infer<typeof postListSchema>, BlogListProps>({
      name: "post-list",
      description: "Blog list page template",
      schema: postListSchema,
      dataSourceId: "blog:entities",
      requiredPermission: "public",
      layout: {
        component: BlogListTemplate,
        interactive: false,
      },
    }),
    "post-detail": createTemplate<
      {
        post: z.infer<typeof enrichedBlogPostSchema>;
        prevPost: z.infer<typeof enrichedBlogPostSchema> | null;
        nextPost: z.infer<typeof enrichedBlogPostSchema> | null;
        seriesPosts: z.infer<typeof enrichedBlogPostSchema>[] | null;
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
        interactive: false,
      },
    }),
    "series-list": createTemplate<
      {
        series: z.infer<typeof seriesListItemSchema>[];
      },
      SeriesListProps
    >({
      name: "series-list",
      description: "List of all series",
      schema: z.object({
        series: z.array(seriesListItemSchema),
      }),
      dataSourceId: "blog:series",
      requiredPermission: "public",
      layout: {
        component: SeriesListTemplate,
        interactive: false,
      },
    }),
    "series-detail": createTemplate<
      z.infer<typeof seriesDetailSchema>,
      SeriesDetailProps
    >({
      name: "series-detail",
      description: "Posts in a specific series",
      schema: seriesDetailSchema,
      dataSourceId: "blog:series",
      requiredPermission: "public",
      layout: {
        component: SeriesDetailTemplate,
        interactive: false,
      },
    }),
    homepage: homepageTemplate,
    generation: blogGenerationTemplate,
    excerpt: blogExcerptTemplate,
    "series-description": seriesDescriptionTemplate,
  });
}
