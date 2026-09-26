import { createTemplate, paginationInfoSchema } from "@brains/sdk/entities";
import type { Template } from "@brains/sdk/entities";
import { z } from "@brains/sdk/entities";
import {
  SeriesListTemplate,
  type SeriesListProps,
} from "../templates/series-list";
import {
  SeriesDetailTemplate,
  type SeriesDetailProps,
} from "../templates/series-detail";
import { seriesListItemSchema } from "../schemas/series";

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
    "series-list": createTemplate<
      z.output<typeof seriesListSchema>,
      SeriesListProps
    >({
      name: "series-list",
      description: "Series list page template",
      schema: seriesListSchema,
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: {
        component: SeriesListTemplate,
      },
    }),
    "series-detail": createTemplate<
      z.output<typeof seriesDetailSchema>,
      SeriesDetailProps
    >({
      name: "series-detail",
      description: "Series detail page template",
      schema: seriesDetailSchema,
      dataSourceId: "entities",
      requiredPermission: "public",
      layout: {
        component: SeriesDetailTemplate,
      },
    }),
  };
}
