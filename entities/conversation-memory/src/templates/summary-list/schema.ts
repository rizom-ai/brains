import { z } from "@brains/utils/zod";

const summaryItemSchema: z.ZodObject<{
  conversationId: z.ZodString;
  channelName: z.ZodString;
  id: z.ZodString;
  entryCount: z.ZodNumber;
  messageCount: z.ZodNumber;
  latestEntry: z.ZodString;
  updated: z.ZodString;
  created: z.ZodString;
}> = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  id: z.string(),
  entryCount: z.number(),
  messageCount: z.number(),
  latestEntry: z.string(),
  updated: z.string(),
  created: z.string(),
});

export type SummaryItem = z.output<typeof summaryItemSchema>;

export const summaryListSchema: z.ZodObject<{
  summaries: z.ZodArray<typeof summaryItemSchema>;
  totalCount: z.ZodNumber;
}> = z.object({
  summaries: z.array(summaryItemSchema),
  totalCount: z.number(),
});

export type SummaryListData = z.output<typeof summaryListSchema>;
