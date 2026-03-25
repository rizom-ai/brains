import { z } from "@brains/utils";
import { summaryLogEntrySchema } from "../../schemas/summary";

// Schema for summary detail page data with parsed entries
export const summaryDetailSchema = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  entries: z.array(summaryLogEntrySchema), // Parsed entries with 4 fields each
  totalMessages: z.number(),
  entryCount: z.number(),
  updated: z.string(), // From the entity itself
});

export type SummaryDetailData = z.infer<typeof summaryDetailSchema>;
