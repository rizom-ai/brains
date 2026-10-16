import { paginationInfoSchema } from "@brains/plugins";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils";
import {
  enrichedWhitepaperSchema,
  templateWhitepaperSchema,
} from "../schemas/whitepaper";
import {
  WhitepaperListTemplate,
  type WhitepaperListProps,
} from "../templates/whitepaper-list";
import {
  WhitepaperDetailTemplate,
  type WhitepaperDetailProps,
} from "../templates/whitepaper-detail";
import { whitepaperGenerationTemplate } from "../templates/generation-template";
import { whitepaperDraftExpansionTemplate } from "../templates/draft-expansion-template";

const whitepaperListSchema = z.object({
  whitepapers: z.array(enrichedWhitepaperSchema),
  pageTitle: z.string().optional(),
  pageLabel: z.string().optional(),
  pagination: paginationInfoSchema.nullable(),
  baseUrl: z.string().optional(),
});

const whitepaperDetailSchema = z.object({
  whitepaper: templateWhitepaperSchema,
  prevWhitepaper: templateWhitepaperSchema.nullable(),
  nextWhitepaper: templateWhitepaperSchema.nullable(),
});

export function getTemplates(): Record<string, Template> {
  return {
    "whitepaper-list": createTemplate<
      z.infer<typeof whitepaperListSchema>,
      WhitepaperListProps
    >({
      name: "whitepaper-list",
      description: "Whitepaper list page template",
      schema: whitepaperListSchema,
      dataSourceId: "whitepaper:entities",
      requiredPermission: "public",
      layout: {
        component: WhitepaperListTemplate,
      },
    }),
    "whitepaper-detail": createTemplate<
      z.infer<typeof whitepaperDetailSchema>,
      WhitepaperDetailProps
    >({
      name: "whitepaper-detail",
      description: "Individual whitepaper page template",
      schema: whitepaperDetailSchema,
      dataSourceId: "whitepaper:entities",
      requiredPermission: "public",
      layout: {
        component: WhitepaperDetailTemplate,
      },
    }),
    generation: whitepaperGenerationTemplate,
    "draft-expansion": whitepaperDraftExpansionTemplate,
  };
}
