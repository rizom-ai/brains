import { z } from "@brains/utils/zod";

const topicSummarySchema: z.ZodObject<{
  id: z.ZodString;
  title: z.ZodString;
  summary: z.ZodString;
  created: z.ZodString;
  updated: z.ZodString;
}> = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  created: z.string(),
  updated: z.string(),
});

// Derived, not hand-written beside the schema: a data source result has to
// satisfy the runtime's JsonObject constraint, and an interface never does.
export type TopicSummary = z.output<typeof topicSummarySchema>;

export const topicListSchema: z.ZodObject<{
  topics: z.ZodArray<typeof topicSummarySchema>;
  totalCount: z.ZodNumber;
}> = z.object({
  topics: z.array(topicSummarySchema),
  totalCount: z.number(),
});

export type TopicListData = z.output<typeof topicListSchema>;
