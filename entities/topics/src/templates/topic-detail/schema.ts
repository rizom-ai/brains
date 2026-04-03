import { z } from "@brains/utils";

// Schema for topic detail page data
export const topicDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  created: z.string(),
  updated: z.string(),
});

export type TopicDetailData = z.infer<typeof topicDetailSchema>;
