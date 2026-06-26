import { z } from "@brains/utils/zod-v4";

const summaryTimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const summaryEntrySchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  timeRange: summaryTimeRangeSchema,
  sourceMessageCount: z.number().int().min(0),
  keyPoints: z.array(z.string()),
});

export const summaryDetailSchema = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  entries: z.array(summaryEntrySchema),
  messageCount: z.number(),
  entryCount: z.number(),
  updated: z.string(),
});

export type SummaryDetailData = z.output<typeof summaryDetailSchema>;
