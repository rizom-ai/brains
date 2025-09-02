import { createTemplate } from "@brains/templates";
import { linkListSchema, type LinkListData } from "./schema";
import { LinkListLayout } from "./layout";
import { LinkListFormatter } from "./formatter";

export const linkListTemplate = createTemplate<LinkListData>({
  name: "link:link-list",
  description: "List view of all captured links",
  schema: linkListSchema,
  dataSourceId: "link:entities",
  requiredPermission: "public",
  formatter: new LinkListFormatter(),
  layout: {
    component: LinkListLayout,
    interactive: false,
  },
});

export { LinkListLayout } from "./layout";
export { linkListSchema, type LinkListData } from "./schema";
export { LinkListFormatter } from "./formatter";
