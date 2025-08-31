import { z } from "@brains/utils";

// Schema for source reference
const sourceReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.string(),
  excerpt: z.string().optional(),
});

// Schema for topic detail page data
export const topicDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  sources: z.array(sourceReferenceSchema),
  created: z.string(),
  updated: z.string(),
});

export type SourceReference = z.infer<typeof sourceReferenceSchema>;
export type TopicDetailData = z.infer<typeof topicDetailSchema>;
