import { z } from "zod";

// Schema for individual topic summary in list
const topicSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  keywords: z.array(z.string()),
  sourceCount: z.number(),
  created: z.string(),
  updated: z.string(),
});

// Schema for topic list page data
export const topicListSchema = z.object({
  topics: z.array(topicSummarySchema),
  totalCount: z.number(),
});

export type TopicSummary = z.infer<typeof topicSummarySchema>;
export type TopicListData = z.infer<typeof topicListSchema>;
