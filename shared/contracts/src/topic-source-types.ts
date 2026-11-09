import { z } from "@brains/utils/zod";
import { defineBusContract, type BusContract } from "./bus-contract";

type TopicSourceTypesRequestSchema = z.ZodObject<
  Record<string, never>,
  z.core.$strict
>;

/** The question carries nothing; the answer is the same for every asker. */
export const topicSourceTypesRequestSchema: TopicSourceTypesRequestSchema =
  z.strictObject({});

export const topicSourceTypesResponseSchema: z.ZodObject<
  { types: z.ZodArray<z.ZodString> },
  z.core.$strict
> = z.strictObject({
  types: z.array(z.string().trim().min(1)),
});
export type TopicSourceTypesResponse = z.output<
  typeof topicSourceTypesResponseSchema
>;

/**
 * Another plugin asks the topics plugin which entity types topics are drawn
 * from, so a map of the corpus measures territories against the same
 * sources. A brain without topics does not answer.
 */
export const topicSourceTypesContract: BusContract<
  TopicSourceTypesRequestSchema,
  typeof topicSourceTypesResponseSchema,
  "request"
> = defineBusContract({
  channel: "topics:source-types",
  request: topicSourceTypesRequestSchema,
  response: topicSourceTypesResponseSchema,
  delivery: "request",
});
