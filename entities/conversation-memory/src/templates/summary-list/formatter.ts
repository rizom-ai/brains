import { StructuredContentFormatter } from "@brains/content-formatters";
import { summaryListSchema, type SummaryListData } from "./schema";

export class SummaryListFormatter extends StructuredContentFormatter<SummaryListData> {
  constructor() {
    super(summaryListSchema, {
      title: "Summary List",
      mappings: [
        {
          key: "summaries",
          label: "Summaries",
          type: "array",
          itemType: "object",
        },
        {
          key: "totalCount",
          label: "Total Count",
          type: "number",
        },
      ],
    });
  }
}
