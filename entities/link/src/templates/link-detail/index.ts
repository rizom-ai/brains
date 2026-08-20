import { createTemplate } from "@brains/sdk/entities";
import { linkDetailDataSchema, type LinkDetailData } from "./schema";
import { LinkDetailLayout } from "./layout";

export const linkDetailTemplate: ReturnType<
  typeof createTemplate<LinkDetailData>
> = createTemplate<LinkDetailData>({
  name: "link-detail",
  description: "Detail view of a captured link",
  schema: linkDetailDataSchema,
  dataSourceId: "entities",
  requiredPermission: "public",
  layout: {
    component: LinkDetailLayout,
  },
});

export { LinkDetailLayout } from "./layout";
export {
  linkDetailDataSchema,
  type LinkDetailData,
  type LinkDetail,
} from "./schema";
