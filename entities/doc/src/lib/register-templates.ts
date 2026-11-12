import {
  contentVisibilitySchema,
  createTemplate,
  paginationInfoSchema,
  type Template,
} from "@brains/sdk/internal/presentation";
import type { JSX } from "react";
import { z } from "@brains/utils/zod";
import { docsChromeSchema } from "@brains/docs-chrome";
import { docsHeroSchema } from "../config";
import {
  DocHomeHeaderTemplate,
  DocHomeHeroTemplate,
  DocHomeSectionsTemplate,
  DocListTemplate,
  type DocListProps,
} from "../templates/doc-list";
import {
  DocDetailTemplate,
  type DocDetailProps,
} from "../templates/doc-detail";

const docFrontmatterSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().nullable().default(null),
  slug: z.string().nullable().default(null),
});

const docMetadataSchema = z.object({
  title: z.string(),
  section: z.string(),
  order: z.number().int(),
  description: z.string().nullable().default(null),
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
  baseUrl: z.string().nullable().default(null),
  hero: docsHeroSchema.nullable().default(null),
  chrome: docsChromeSchema.nullable().default(null),
});

const docDetailSchema = z.object({
  doc: docWithDataSchema,
  docs: z.array(docWithDataSchema),
  prevDoc: docWithDataSchema.nullable(),
  nextDoc: docWithDataSchema.nullable(),
  chrome: docsChromeSchema.nullable().default(null),
});

function docListTemplate(
  name: string,
  description: string,
  component: (props: DocListProps) => JSX.Element,
): Template {
  return createTemplate<z.output<typeof docListSchema>, DocListProps>({
    name,
    description,
    schema: docListSchema,
    dataSourceId: "docs:entities",
    requiredPermission: "public",
    layout: { component },
  });
}

export function getTemplates(): Record<string, Template> {
  return {
    "doc-list": docListTemplate(
      "doc-list",
      "Documentation index template",
      DocListTemplate,
    ),
    "doc-home-hero": docListTemplate(
      "doc-home-hero",
      "Docs home, first part: the header and the hero",
      DocHomeHeroTemplate,
    ),
    "doc-home-header": docListTemplate(
      "doc-home-header",
      "Docs home, first part when the site draws its own opening: the header alone",
      DocHomeHeaderTemplate,
    ),
    "doc-home-sections": docListTemplate(
      "doc-home-sections",
      "Docs home, last part: the sections and their docs",
      DocHomeSectionsTemplate,
    ),
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
