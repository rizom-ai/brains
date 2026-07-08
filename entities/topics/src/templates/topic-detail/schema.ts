import { z } from "@brains/utils/zod";

export interface TopicDetailData {
  id: string;
  title: string;
  content: string;
  created: string;
  updated: string;
}

// Schema for topic detail page data
export const topicDetailSchema: z.ZodType<TopicDetailData, TopicDetailData> =
  z.object({
    id: z.string(),
    title: z.string(),
    content: z.string(),
    created: z.string(),
    updated: z.string(),
  });
