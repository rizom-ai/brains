import { z } from "@brains/utils/zod";
import type { SummaryEntry } from "../../schemas/summary";

export interface SummaryDetailData {
  conversationId: string;
  channelName: string;
  entries: SummaryEntry[];
  messageCount: number;
  entryCount: number;
  updated: string;
}

const summaryTimeRangeSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
});

const summaryEntrySchema: z.ZodType<SummaryEntry> = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  timeRange: summaryTimeRangeSchema,
  sourceMessageCount: z.number().int().min(0),
  keyPoints: z.array(z.string()),
});

export const summaryDetailSchema: z.ZodType<SummaryDetailData> = z.object({
  conversationId: z.string(),
  channelName: z.string(),
  entries: z.array(summaryEntrySchema),
  messageCount: z.number(),
  entryCount: z.number(),
  updated: z.string(),
});
