import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { paginationInfoSchema } from "@brains/plugins";
import { z } from "@brains/utils";
import { seriesListItemSchema } from "../schemas/series";
import {
  SeriesListTemplate,
  type SeriesListProps,
} from "../templates/series-list";
import {
  SeriesDetailTemplate,
  type SeriesDetailProps,
} from "../templates/series-detail";

const seriesListSchema = z.object({
  series: z.array(seriesListItemSchema),
  pagination: paginationInfoSchema.nullable().optional(),
});

const seriesDetailSchema = z.object({
  seriesName: z.string(),
  posts: z.array(z.record(z.unknown())),
  series: seriesListItemSchema,
  description: z.string().optional(),
});

export function getTemplates(): Record<string, Template> {
  return {
    "series-list": createTemplate<
      z.infer<typeof seriesListSchema>,
      SeriesListProps
    >({
      name: "series-list",
      description: "Series list page template",
      schema: seriesListSchema,
      dataSourceId: "series:entities",
      requiredPermission: "public",
      layout: {
        component: SeriesListTemplate,
      },
    }),
    "series-detail": createTemplate<
      z.infer<typeof seriesDetailSchema>,
      SeriesDetailProps
    >({
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
