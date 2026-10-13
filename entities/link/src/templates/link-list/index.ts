import { createTemplate } from "@brains/templates";
import { linkListSchema, type LinkListData } from "./schema";
import { LinkListLayout } from "./layout";

export const linkListTemplate: ReturnType<typeof createTemplate<LinkListData>> =
  createTemplate<LinkListData>({
    name: "link:link-list",
    description: "List view of all captured links",
    schema: linkListSchema,
    dataSourceId: "link:entities",
    requiredPermission: "public",
    layout: {
      component: LinkListLayout,
    },
  });

export { LinkListLayout } from "./layout";
export { linkListSchema, type LinkListData } from "./schema";
