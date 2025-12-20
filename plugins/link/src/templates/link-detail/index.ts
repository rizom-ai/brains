import { createTemplate } from "@brains/templates";
import { linkDetailDataSchema, type LinkDetailData } from "./schema";
import { LinkDetailLayout } from "./layout";

export const linkDetailTemplate = createTemplate<LinkDetailData>({
  name: "link:link-detail",
  description: "Detail view of a captured link",
  schema: linkDetailDataSchema,
  dataSourceId: "link:entities",
  requiredPermission: "public",
  layout: {
    component: LinkDetailLayout,
    interactive: false,
  },
});

export { LinkDetailLayout } from "./layout";
export {
  linkDetailDataSchema,
  type LinkDetailData,
  type LinkDetail,
} from "./schema";
