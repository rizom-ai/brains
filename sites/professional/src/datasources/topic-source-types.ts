import {
  topicSourceTypesContract,
  type BusResult,
  type TopicSourceTypesResponse,
} from "@brains/contracts";

/**
 * The entity types topics are drawn from, as the topics plugin answers, so
 * the atlas measures territories against the same sources. None where the
 * brain has no topics plugin or it cannot answer: then there are no topics.
 */
export async function loadTopicSourceTypes(messaging: {
  request(
    contract: typeof topicSourceTypesContract,
    payload: Record<string, never>,
  ): Promise<BusResult<TopicSourceTypesResponse>>;
}): Promise<string[]> {
  try {
    const answer = await messaging.request(topicSourceTypesContract, {});
    return answer.status === "answered" ? answer.data.types : [];
  } catch {
    // Without topics the map has no territories to measure.
    return [];
  }
}
