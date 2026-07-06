import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import {
  SeriesListTemplate,
  type SeriesListProps,
} from "../templates/series-list";
import {
  SeriesDetailTemplate,
  type SeriesDetailProps,
} from "../templates/series-detail";

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

const seriesFrontmatterSchema = z.object({
  title: z.string(),
  slug: z.string(),
  coverImageId: z.string().optional(),
});

const seriesMetadataSchema = z.object({
  title: z.string(),
  slug: z.string(),
});

const seriesListItemSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: seriesMetadataSchema,
  contentHash: z.string(),
  frontmatter: seriesFrontmatterSchema,
  description: z.string().optional(),
  postCount: z.number(),
  coverImageUrl: z.string().optional(),
  coverImageWidth: z.number().optional(),
  coverImageHeight: z.number().optional(),
});

const seriesListSchema = z.object({
  series: z.array(seriesListItemSchema),
  pagination: paginationInfoSchema.nullable().optional(),
});

const seriesDetailSchema = z.object({
  seriesName: z.string(),
  posts: z.array(z.record(z.string(), z.unknown())),
  series: seriesListItemSchema,
  description: z.string().optional(),
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
      dataSourceId: "series:entities",
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
      dataSourceId: "series:entities",
      requiredPermission: "public",
      layout: {
        component: SeriesDetailTemplate,
      },
    }),
  };
}
