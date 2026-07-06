import { z } from "@brains/utils/zod-v4";

export interface SummaryItem {
  conversationId: string;
  channelName: string;
  id: string;
  entryCount: number;
  messageCount: number;
  latestEntry: string;
  updated: string;
  created: string;
}

export interface SummaryListData {
  summaries: SummaryItem[];
  totalCount: number;
}

const summaryItemSchema: z.ZodType<SummaryItem> = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  id: z.string(),
  entryCount: z.number(),
  messageCount: z.number(),
  latestEntry: z.string(),
  updated: z.string(),
  created: z.string(),
});

export const summaryListSchema: z.ZodType<SummaryListData> = z.object({
  summaries: z.array(summaryItemSchema),
  totalCount: z.number(),
});
