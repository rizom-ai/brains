import { createTemplate } from "@brains/templates";
import { summaryListSchema, type SummaryListData } from "./schema";
import { SummaryListLayout } from "./layout";
import { SummaryListFormatter } from "./formatter";

export const summaryListTemplate = createTemplate<SummaryListData>({
  name: "summary:summary-list",
  description: "List view of all conversation summaries",
  schema: summaryListSchema,
  dataSourceId: "summary:entities",
  requiredPermission: "public",
  formatter: new SummaryListFormatter(),
  layout: {
    component: SummaryListLayout,
    interactive: false,
  },
});

export { SummaryListLayout } from "./layout";
export { summaryListSchema, type SummaryListData } from "./schema";
export { SummaryListFormatter } from "./formatter";
