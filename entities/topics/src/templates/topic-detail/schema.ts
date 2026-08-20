import { z } from "@brains/utils/zod";

export const topicDetailSchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  content: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
}> = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  created: z.string(),
  updated: z.string(),
});

export type TopicDetailData = z.output<typeof topicDetailSchema>;
