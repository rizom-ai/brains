import { z } from "@brains/utils/zod-v4";

export interface TopicSummary {
  id: string;
  title: string;
  summary: string;
  created: string;
  updated: string;
}

// Schema for individual topic summary in list
const topicSummarySchema: z.ZodType<TopicSummary, TopicSummary> = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  created: z.string(),
  updated: z.string(),
});

export interface TopicListData {
  topics: TopicSummary[];
  totalCount: number;
}

// Schema for topic list page data
export const topicListSchema: z.ZodType<TopicListData, TopicListData> =
  z.object({
    topics: z.array(topicSummarySchema),
    totalCount: z.number(),
  });
