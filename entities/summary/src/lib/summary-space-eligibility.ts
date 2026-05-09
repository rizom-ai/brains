import type { Conversation, Message } from "@brains/plugins";

export type SummaryEligibilityReason =
  | "configured-space"
  | "no-spaces-configured"
  | "space-not-configured"
  | "system-only";

export interface SummaryEligibilityResult {
  eligible: boolean;
  reason: SummaryEligibilityReason;
  spaceId: string;
}

export function getConversationSpaceId(conversation: Conversation): string {
  return `${conversation.interfaceType}:${conversation.channelId}`;
}

export function isSpaceSelectorMatch(
  selector: string,
  spaceId: string,
): boolean {
  if (selector === spaceId) return true;

  const escaped = selector.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const pattern = `^${escaped.replace(/\*/g, ".*")}$`;
  return new RegExp(pattern).test(spaceId);
}

export function evaluateSummaryEligibility(params: {
  conversation: Conversation;
  spaces: string[];
  messages?: Message[];
}): SummaryEligibilityResult {
  const { conversation, spaces, messages } = params;
  const spaceId = getConversationSpaceId(conversation);

  if (spaces.length === 0) {
    return { eligible: false, reason: "no-spaces-configured", spaceId };
  }

  if (!spaces.some((selector) => isSpaceSelectorMatch(selector, spaceId))) {
    return { eligible: false, reason: "space-not-configured", spaceId };
  }

  if (
    messages &&
    messages.length > 0 &&
    messages.every((message) => message.role === "system")
  ) {
    return { eligible: false, reason: "system-only", spaceId };
  }

  return { eligible: true, reason: "configured-space", spaceId };
}
