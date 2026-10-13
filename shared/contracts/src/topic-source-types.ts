import { z } from "@brains/utils/zod";

/**
 * Another plugin asks the topics plugin which entity types topics are drawn
 * from, so a map of the corpus measures territories against the same
 * sources. A brain without topics does not answer.
 */
export const TOPIC_SOURCE_TYPES_MESSAGE = "topics:source-types" as const;

export const topicSourceTypesResponseSchema: z.ZodObject<
  { types: z.ZodArray<z.ZodString> },
  z.core.$strict
> = z.strictObject({
  types: z.array(z.string().trim().min(1)),
});
export type TopicSourceTypesResponse = z.output<
  typeof topicSourceTypesResponseSchema
>;
