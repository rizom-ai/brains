import { z } from "@brains/utils/zod-v4";

// Schema for topic detail page data
export const topicDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
});

export type TopicDetailData = z.output<typeof topicDetailSchema>;
