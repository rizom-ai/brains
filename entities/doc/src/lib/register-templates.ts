import { paginationInfoSchema } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils";
import { docWithDataSchema } from "../schemas/doc";
import { DocListTemplate, type DocListProps } from "../templates/doc-list";
import {
  DocDetailTemplate,
  type DocDetailProps,
} from "../templates/doc-detail";

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
    "doc-list": createTemplate<z.infer<typeof docListSchema>, DocListProps>({
      name: "doc-list",
      description: "Documentation index template",
      schema: docListSchema,
      dataSourceId: "docs:entities",
      requiredPermission: "public",
      layout: { component: DocListTemplate },
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
