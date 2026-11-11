import { topicTitlesContract } from "@brains/contracts";
import type { InterfaceRuntime } from "@brains/sdk/internal/interface-runtime";

/**
 * What the brain's public work is about, as its topics plugin answers: the
 * subjects a visitor's question is screened against. None where the brain
 * has no topics plugin or it cannot answer.
 */
export async function loadSiteSubjects(
  messaging: Pick<InterfaceRuntime, "request">,
): Promise<string[]> {
  try {
    const answer = await messaging.request(topicTitlesContract, {});
    return answer.status === "answered" ? answer.data.titles : [];
  } catch {
    // Screening still runs without subjects: it judges against the owner's
    // introduction, and abuse, injection and harm need no scope.
    return [];
  }
}
