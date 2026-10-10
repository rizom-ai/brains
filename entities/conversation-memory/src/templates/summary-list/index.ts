import { createTemplate } from "@brains/sdk/entities";
import { summaryListSchema, type SummaryListData } from "./schema";
import { SummaryListLayout } from "./layout";
import { SUMMARY_DATASOURCE_ID } from "../../lib/constants";

export const summaryListTemplate: ReturnType<
  typeof createTemplate<SummaryListData>
> = createTemplate<SummaryListData>({
  name: "conversation-memory:summary-list",
  description: "List view of all conversation summaries",
  schema: summaryListSchema,
  dataSourceId: SUMMARY_DATASOURCE_ID,
  requiredPermission: "public",
  layout: {
    component: SummaryListLayout,
  },
});

export { SummaryListLayout } from "./layout";
export { summaryListSchema, type SummaryListData } from "./schema";
