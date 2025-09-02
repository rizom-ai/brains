import { z } from "@brains/utils";

// Schema for individual summary log entry
const summaryLogEntrySchema = z.object({
  title: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
  windowStart: z.number(),
  windowEnd: z.number(),
  keyPoints: z.array(z.string()).optional(),
  decisions: z.array(z.string()).optional(),
  actionItems: z.array(z.string()).optional(),
  participants: z.array(z.string()).optional(),
});

// Schema for summary detail page data
export const summaryDetailSchema = z.object({
  conversationId: z.string(),
  entries: z.array(summaryLogEntrySchema),
  totalMessages: z.number(),
  lastUpdated: z.string(),
  entryCount: z.number(),
});

export type SummaryLogEntry = z.infer<typeof summaryLogEntrySchema>;
export type SummaryDetailData = z.infer<typeof summaryDetailSchema>;
