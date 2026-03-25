import { StructuredContentFormatter } from "@brains/utils";
import { summaryDetailSchema, type SummaryDetailData } from "./schema";

export class SummaryDetailFormatter extends StructuredContentFormatter<SummaryDetailData> {
  constructor() {
    super(summaryDetailSchema, {
      title: "Summary Detail",
      mappings: [
        {
          key: "conversationId",
          label: "Conversation ID",
          type: "string",
        },
        {
          key: "entries",
          label: "Log Entries",
          type: "array",
          itemType: "object",
        },
        {
          key: "totalMessages",
          label: "Total Messages",
          type: "number",
        },
        {
          key: "entryCount",
          label: "Entry Count",
          type: "number",
        },
        {
          key: "updated",
          label: "Last Updated",
          type: "string",
        },
      ],
    });
  }
}
