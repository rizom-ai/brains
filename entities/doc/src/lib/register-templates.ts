import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod-v4";
import { DocListTemplate, type DocListProps } from "../templates/doc-list";
import {
  DocDetailTemplate,
  type DocDetailProps,
} from "../templates/doc-detail";

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

const docFrontmatterSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  sourcePath: z.string(),
  description: z.string().optional(),
  slug: z.string().optional(),
});

const docMetadataSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().optional(),
  slug: z.string(),
});

const docWithDataSchema = z.object({
  id: z.string(),
  entityType: z.literal("doc"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  metadata: docMetadataSchema,
  contentHash: z.string(),
  frontmatter: docFrontmatterSchema,
  body: z.string(),
});

const docListSchema = z.object({
  docs: z.array(docWithDataSchema),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

const docDetailSchema = z.object({
  doc: docWithDataSchema,
  docs: z.array(docWithDataSchema),
  prevDoc: docWithDataSchema.nullable(),
  nextDoc: docWithDataSchema.nullable(),
});

export function getTemplates(): Record<string, Template> {
  return {
    "doc-list": createTemplate<z.output<typeof docListSchema>, DocListProps>({
      name: "doc-list",
      description: "Documentation index template",
      schema: docListSchema,
      dataSourceId: "docs:entities",
      requiredPermission: "public",
      layout: { component: DocListTemplate },
    }),
    "doc-detail": createTemplate<
      z.output<typeof docDetailSchema>,
      DocDetailProps
    >({
      name: "doc-detail",
      description: "Documentation page template",
      schema: docDetailSchema,
      dataSourceId: "docs:entities",
      requiredPermission: "public",
      layout: { component: DocDetailTemplate },
    }),
  };
}
