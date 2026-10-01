import { z } from "@brains/utils/zod";

/**
 * Another plugin asks the topics plugin what the brain's public work is
 * about, for example to screen a site visitor's question against it. The
 * answer is the titles of its public topics; a brain without topics does not
 * answer.
 */
export const TOPIC_TITLES_MESSAGE = "topics:public-titles" as const;

export const topicTitlesResponseSchema: z.ZodObject<
  { titles: z.ZodArray<z.ZodString> },
  z.core.$strict
> = z.strictObject({
  titles: z.array(z.string().trim().min(1).max(500)).max(20),
});
export type TopicTitlesResponse = z.output<typeof topicTitlesResponseSchema>;
