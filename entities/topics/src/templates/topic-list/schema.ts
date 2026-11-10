import { z } from "@brains/utils/zod";

type TopicSummarySchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  summary: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
}>;

// Schema for individual topic summary in list
const topicSummarySchema: TopicSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  created: z.string(),
  updated: z.string(),
});

export type TopicSummary = z.output<typeof topicSummarySchema>;

// Schema for topic list page data
export const topicListSchema: z.ZodObject<{
  topics: z.ZodArray<TopicSummarySchema>;
  totalCount: z.ZodNumber;
}> = z.object({
  topics: z.array(topicSummarySchema),
  totalCount: z.number(),
});

export type TopicListData = z.output<typeof topicListSchema>;
