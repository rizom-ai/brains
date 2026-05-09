import { createTemplate } from "@brains/templates";
import { summaryListSchema, type SummaryListData } from "./schema";
import { SummaryListLayout } from "./layout";
import { SummaryListFormatter } from "./formatter";
import { SUMMARY_DATASOURCE_ID } from "../../lib/constants";

export const summaryListTemplate = createTemplate<SummaryListData>({
  name: "conversation-memory:summary-list",
  description: "List view of all conversation summaries",
  schema: summaryListSchema,
  dataSourceId: SUMMARY_DATASOURCE_ID,
  requiredPermission: "public",
  formatter: new SummaryListFormatter(),
  layout: {
    component: SummaryListLayout,
  },
});

export { SummaryListLayout } from "./layout";
export { summaryListSchema, type SummaryListData } from "./schema";
export { SummaryListFormatter } from "./formatter";
