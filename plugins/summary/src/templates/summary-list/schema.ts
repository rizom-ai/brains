import { z } from "@brains/utils";

// Schema for individual summary in list
const summaryItemSchema = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  id: z.string(),
  entryCount: z.number(),
  totalMessages: z.number(),
  latestEntry: z.string(),
  lastUpdated: z.string(),
  created: z.string(),
});

// Schema for summary list page data
export const summaryListSchema = z.object({
  summaries: z.array(summaryItemSchema),
  totalCount: z.number(),
});

export type SummaryItem = z.infer<typeof summaryItemSchema>;
export type SummaryListData = z.infer<typeof summaryListSchema>;
