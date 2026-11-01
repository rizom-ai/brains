/** What a reply asks when an action waits for the user's approval. */
export const CONFIRMATION_REQUEST = "Confirmation required.";

/**
 * The reply of a turn that proposes an approval-gated action: what the agent
 * wrote, then the confirmation request below it. The action's summary and
 * preview travel with the pending confirmation, which each interface shows
 * under the reply.
 */
export function composeConfirmationReply(agentText: string): string {
  const answer = agentText.trim();
  // Earlier replies in the history ask this, so the agent can echo it.
  const echoesRequest =
    answer.replace(/\.$/, "").toLowerCase() ===
    CONFIRMATION_REQUEST.replace(/\.$/, "").toLowerCase();
  return answer && !echoesRequest
    ? `${answer}\n\n${CONFIRMATION_REQUEST}`
    : CONFIRMATION_REQUEST;
}
