import {
  TOPIC_SOURCE_TYPES_MESSAGE,
  topicSourceTypesResponseSchema,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";

const answeredSchema = z.object({
  success: z.literal(true),
  data: topicSourceTypesResponseSchema,
});

/**
 * The entity types topics are drawn from, as the topics plugin answers, so
 * the atlas measures territories against the same sources. None where the
 * brain has no topics plugin or it cannot answer: then there are no topics.
 */
export async function loadTopicSourceTypes(messaging: {
  send(message: { type: string; payload: unknown }): Promise<unknown>;
}): Promise<string[]> {
  try {
    const response = answeredSchema.safeParse(
      await messaging.send({ type: TOPIC_SOURCE_TYPES_MESSAGE, payload: {} }),
    );
    return response.success ? response.data.data.types : [];
  } catch {
    // Without topics the map has no territories to measure.
    return [];
  }
}
