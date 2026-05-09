import { createTemplate } from "@brains/templates";
import { summaryDetailSchema, type SummaryDetailData } from "./schema";
import { SummaryDetailLayout } from "./layout";
import { SummaryDetailFormatter } from "./formatter";
import { SUMMARY_DATASOURCE_ID } from "../../lib/constants";

export const summaryDetailTemplate = createTemplate<SummaryDetailData>({
  name: "conversation-memory:summary-detail",
  description:
    "Detailed view of a conversation summary with chronological log entries",
  schema: summaryDetailSchema,
  dataSourceId: SUMMARY_DATASOURCE_ID,
  requiredPermission: "public",
  formatter: new SummaryDetailFormatter(),
  layout: {
    component: SummaryDetailLayout,
  },
});

export { SummaryDetailLayout } from "./layout";
export { summaryDetailSchema, type SummaryDetailData } from "./schema";
export { SummaryDetailFormatter } from "./formatter";
