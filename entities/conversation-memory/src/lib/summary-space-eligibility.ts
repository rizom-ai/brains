import type { Conversation } from "@brains/plugins";
import { matchSpaceSelector } from "@brains/templates";

export type SummaryEligibilityReason =
  | "configured-space"
  | "no-spaces-configured"
  | "space-not-configured";

export interface SummaryEligibilityResult {
  eligible: boolean;
  reason: SummaryEligibilityReason;
  spaceId: string;
}

export function getConversationSpaceId(scope: {
  interfaceType: string;
  channelId: string;
}): string {
  return `${scope.interfaceType}:${scope.channelId}`;
}

export function evaluateSummaryEligibility(params: {
  conversation: Conversation;
  spaces: string[];
}): SummaryEligibilityResult {
  const { conversation, spaces } = params;
  const spaceId = getConversationSpaceId(conversation);

  if (spaces.length === 0) {
    return { eligible: false, reason: "no-spaces-configured", spaceId };
  }

  if (!spaces.some((selector) => matchSpaceSelector(selector, spaceId))) {
    return { eligible: false, reason: "space-not-configured", spaceId };
  }

  return { eligible: true, reason: "configured-space", spaceId };
}
