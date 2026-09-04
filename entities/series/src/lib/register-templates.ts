import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { contentVisibilitySchema, paginationInfoSchema } from "@brains/plugins";
import { SeriesListTemplate } from "../templates/series-list";
import { SeriesDetailTemplate } from "../templates/series-detail";

const seriesFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().nullable().default(null),
});

const seriesMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
});

const seriesListItemSchema = z.object({
  id: z.string(),
  // The list component reads this as the literal "series"; the schema has to
  // prove that rather than let any entity type through.
  entityType: z.literal("series"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: seriesMetadataSchema,
  contentHash: z.string(),
  frontmatter: seriesFrontmatterSchema,
  description: z.string().nullable().default(null),
  postCount: z.number(),
  coverImageUrl: z.string().nullable().default(null),
  coverImageWidth: z.number().nullable().default(null),
  coverImageHeight: z.number().nullable().default(null),
});

const seriesListSchema = z.object({
  series: z.array(seriesListItemSchema),
  pagination: paginationInfoSchema.nullable().default(null),
});

const seriesMemberSchema = z.object({
  id: z.string(),
  url: z.string().nullable().default(null),
  frontmatter: z
    .object({
      title: z.string().nullable().default(null),
      seriesIndex: z.number().nullable().default(null),
      excerpt: z.string().nullable().default(null),
      publishedAt: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  metadata: z.record(z.string(), z.json()).nullable().default(null),
});

const seriesDetailSchema = z.object({
  seriesName: z.string(),
  posts: z.array(seriesMemberSchema),
  series: seriesListItemSchema,
  description: z.string().nullable().default(null),
});

export function getTemplates(): Record<string, Template> {
  return {
    "series-list": createTemplate<z.output<typeof seriesListSchema>>({
      name: "series-list",
      description: "Series list page template",
      schema: seriesListSchema,
      dataSourceId: "series:entities",
      requiredPermission: "public",
      layout: {
        component: SeriesListTemplate,
      },
    }),
    "series-detail": createTemplate<z.output<typeof seriesDetailSchema>>({
      name: "series-detail",
      description: "Series detail page template",
      schema: seriesDetailSchema,
      dataSourceId: "series:entities",
      requiredPermission: "public",
      layout: {
        component: SeriesDetailTemplate,
      },
    }),
  };
}
