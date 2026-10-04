import {
  TOPIC_TITLES_MESSAGE,
  topicTitlesResponseSchema,
} from "@brains/contracts";
import { z, type SubscriptionRequester } from "@brains/sdk/interfaces";

const topicTitlesRequest = {
  topic: TOPIC_TITLES_MESSAGE,
  payload: z.object({}),
  response: topicTitlesResponseSchema,
};

/**
 * What the brain's public work is about, as its topics plugin answers: the
 * subjects a visitor's question is screened against. None where the brain
 * has no topics plugin or it cannot answer.
 */
export async function loadSiteSubjects(messaging: {
  readonly request: SubscriptionRequester;
}): Promise<string[]> {
  try {
    const response = await messaging.request(topicTitlesRequest, {});
    return response.ok ? response.data.titles : [];
  } catch {
    // Screening still runs without subjects: it judges against the owner's
    // introduction, and abuse, injection and harm need no scope.
    return [];
  }
}
