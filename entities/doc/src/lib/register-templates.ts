import { paginationInfoSchema } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { StructuredContentFormatter, z } from "@brains/utils";
import { docWithDataSchema } from "../schemas/doc";
import { DocListTemplate, type DocListProps } from "../templates/doc-list";
import {
  DocDetailTemplate,
  type DocDetailProps,
} from "../templates/doc-detail";
import { DocsEcosystem } from "../templates/docs-design";

const ecosystemContentSchema = z.object({
  eyebrow: z.string(),
  headline: z.string(),
  cards: z.array(
    z.object({
      suffix: z.enum(["ai", "foundation", "work"]),
      title: z.string(),
      body: z.string(),
      linkLabel: z.string(),
      linkHref: z.string(),
    }),
  ),
});

const docListSchema = z.object({
  docs: z.array(docWithDataSchema),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

const ecosystemFormatter = new StructuredContentFormatter(
  ecosystemContentSchema,
  {
    title: "Ecosystem Section",
    mappings: [
      { key: "eyebrow", label: "Eyebrow", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      {
        key: "cards",
        label: "Cards",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "suffix", label: "Suffix", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "body", label: "Body", type: "string" },
          { key: "linkLabel", label: "Link Label", type: "string" },
          { key: "linkHref", label: "Link Href", type: "string" },
        ],
      },
    ],
  },
);

const docDetailSchema = z.object({
  doc: docWithDataSchema,
  docs: z.array(docWithDataSchema),
  prevDoc: docWithDataSchema.nullable(),
  nextDoc: docWithDataSchema.nullable(),
});

export function getTemplates(): Record<string, Template> {
  return {
    "doc-list": createTemplate<z.infer<typeof docListSchema>, DocListProps>({
      name: "doc-list",
      description: "Documentation index template",
      schema: docListSchema,
      dataSourceId: "docs:entities",
      requiredPermission: "public",
      layout: { component: DocListTemplate },
    }),
    "docs-ecosystem": createTemplate<
      z.infer<typeof ecosystemContentSchema>,
      z.infer<typeof ecosystemContentSchema>
    >({
      name: "docs-ecosystem",
      description: "Rizom ecosystem section for docs pages",
      schema: ecosystemContentSchema,
      formatter: ecosystemFormatter,
      requiredPermission: "public",
      layout: { component: DocsEcosystem },
    }),
    "doc-detail": createTemplate<
      z.infer<typeof docDetailSchema>,
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
