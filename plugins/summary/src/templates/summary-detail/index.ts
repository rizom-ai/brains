import { createTemplate } from "@brains/templates";
import { summaryDetailSchema, type SummaryDetailData } from "./schema";
import { SummaryDetailLayout } from "./layout";
import { SummaryDetailFormatter } from "./formatter";

export const summaryDetailTemplate = createTemplate<SummaryDetailData>({
  name: "summary:summary-detail",
  description:
    "Detailed view of a conversation summary with chronological log entries",
  schema: summaryDetailSchema,
  dataSourceId: "summary:entity",
  requiredPermission: "public",
  formatter: new SummaryDetailFormatter(),
  layout: {
    component: SummaryDetailLayout,
    interactive: false,
  },
});

export { SummaryDetailLayout } from "./layout";
export { summaryDetailSchema, type SummaryDetailData } from "./schema";
export { SummaryDetailFormatter } from "./formatter";
