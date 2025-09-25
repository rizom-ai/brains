import { z } from "@brains/utils";
import { summaryLogEntrySchema } from "../../schemas/summary";

// Schema for summary detail page data with parsed entries
export const summaryDetailSchema = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  entries: z.array(summaryLogEntrySchema), // Parsed entries with 4 fields each
  totalMessages: z.number(),
  lastUpdated: z.string(),
  entryCount: z.number(),
});

export type SummaryDetailData = z.infer<typeof summaryDetailSchema>;
