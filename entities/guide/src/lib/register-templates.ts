import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { z } from "@brains/utils/zod";
import { contentVisibilitySchema } from "@brains/plugins";
import { guideMetadataSchema } from "../schemas/guide";
import { guideFrontmatterSchema } from "../schemas/guide-frontmatter";
import {
  GuideDetailTemplate,
  type GuideDetailProps,
} from "../templates/guide-detail";
import {
  GUIDE_PAGE_SCRIPT_SRC,
  guidePageScript,
} from "../templates/guide-page-script";
import {
  GuideListTemplate,
  type GuideListProps,
} from "../templates/guide-list";
import { GuideBandTemplate } from "../templates/guide-band";

// Templates take rendered data, whose visibility is already canonical, so the
// display schema uses the plain visibility schema rather than the parser's.
const guideDisplaySchema = z.object({
  id: z.string(),
  entityType: z.literal("guide"),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  visibility: contentVisibilitySchema,
  contentHash: z.string(),
  metadata: guideMetadataSchema,
  frontmatter: guideFrontmatterSchema,
  body: z.string(),
});

const guideListSchema = z.object({
  guides: z.array(guideDisplaySchema),
});

const guideDetailSchema = z.object({
  guide: guideDisplaySchema,
  otherGuides: z.array(guideDisplaySchema),
});

export function getTemplates(): Record<string, Template> {
  return {
    "guide-list": createTemplate<
      z.output<typeof guideListSchema>,
      GuideListProps
    >({
      name: "guide-list",
      description: "Index of moving-in guides",
      schema: guideListSchema,
      dataSourceId: "guides:entities",
      requiredPermission: "public",
      layout: { component: GuideListTemplate },
    }),
    "guide-band": createTemplate<
      z.output<typeof guideListSchema>,
      GuideListProps
    >({
      name: "guide-band",
      description:
        "The guides as a band on a composed docs page, such as the docs home",
      schema: guideListSchema,
      dataSourceId: "guides:entities",
      requiredPermission: "public",
      layout: { component: GuideBandTemplate },
    }),
    "guide-detail": createTemplate<
      z.output<typeof guideDetailSchema>,
      GuideDetailProps
    >({
      name: "guide-detail",
      description: "A moving-in guide for one kind of user",
      schema: guideDetailSchema,
      dataSourceId: "guides:entities",
      requiredPermission: "public",
      runtimeScripts: [{ src: GUIDE_PAGE_SCRIPT_SRC, defer: true }],
      staticAssets: { [GUIDE_PAGE_SCRIPT_SRC]: guidePageScript },
      layout: { component: GuideDetailTemplate },
    }),
  };
}
