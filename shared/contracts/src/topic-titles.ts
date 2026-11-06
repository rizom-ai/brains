import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type TopicTitlesRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

/** The question carries nothing; the answer is the same for every asker. */
export const topicTitlesRequestSchema: TopicTitlesRequestSchema =
  z.strictObject({});

export const topicTitlesResponseSchema: z.ZodObject<
  { titles: z.ZodArray<z.ZodString> },
  z.core.$strict
> = z.strictObject({
  titles: z.array(z.string().trim().min(1).max(500)).max(20),
});
export type TopicTitlesResponse = z.output<typeof topicTitlesResponseSchema>;

/**
 * Another plugin asks the topics plugin what the brain's public work is
 * about, for example to screen a site visitor's question against it. The
 * answer is the titles of its public topics; a brain without topics does not
 * answer.
 */
export const topicTitlesContract: BusContract<
  TopicTitlesRequestSchema,
  typeof topicTitlesResponseSchema,
  "request"
> = defineBusContract({
  channel: "topics:public-titles",
  request: topicTitlesRequestSchema,
  response: topicTitlesResponseSchema,
  delivery: "request",
});
