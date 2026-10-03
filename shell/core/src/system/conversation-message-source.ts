import {
  isSavableAssistantMessage,
  parseConversationMessageMetadata,
} from "@brains/conversation-service";
import type { ToolContext } from "@brains/mcp-service";
import { computeContentHash } from "@brains/utils/hash";
import type { z } from "@brains/utils/zod";
import type {
  createPreferredSourceInputSchema,
  userMessageSourceInputSchema,
} from "./schemas";
import type { SystemServices } from "./types";

export type UserMessageSource = z.output<typeof userMessageSourceInputSchema>;

/** A source that the server reads from a stored conversation message. */
export type ConversationMessageRef = Extract<
  z.output<typeof createPreferredSourceInputSchema>,
  { kind: "prior-response" | "user-message" }
>;

/**
 * Reads the referenced message text on the server, so verbatim content never
 * passes through the model. A user-message source selects the text between
 * its boundaries and, once frozen for confirmation, must still hash to the
 * approved text.
 */
export async function resolveConversationMessageContent(
  services: SystemServices,
  input: ConversationMessageRef,
  toolContext: ToolContext,
): Promise<
  | { success: true; messageId: string; content: string }
  | { success: false; error: string }
> {
  const conversationId = toolContext.conversationId ?? toolContext.channelId;
  if (!conversationId) {
    return {
      success: false,
      error:
        "Conversation message is not accessible in this conversation or does not exist.",
    };
  }

  const messages = await services.conversationService.getMessages(
    conversationId,
    { limit: 100 },
  );
  const userSource = input.kind === "user-message";
  const candidates = userSource
    ? messages.filter((candidate) => {
        if (candidate.role !== "user") return false;
        const level = toolContext.userPermissionLevel ?? "public";
        if (level === "admin") return true;
        const storedLevel = parseConversationMessageMetadata(
          candidate.metadata,
        )?.["userPermissionLevel"];
        return (
          (storedLevel === "public" ||
            storedLevel === "trusted" ||
            storedLevel === "admin") &&
          services.permissionService.hasPermission(level, storedLevel)
        );
      })
    : messages.filter(isSavableAssistantMessage);
  const message = input.messageId
    ? candidates.find((candidate) => candidate.id === input.messageId)
    : candidates.at(-1);

  if (!message) {
    return {
      success: false,
      error:
        "Conversation message is not accessible in this conversation or does not exist.",
    };
  }

  if (!userSource) {
    return { success: true, messageId: message.id, content: message.content };
  }

  const boundary = (
    value: string | undefined,
    fallback: number,
    after: boolean,
  ): number => {
    if (value === undefined) return fallback;
    if (input.boundaryMode === "lines") {
      if (/[\r\n]/.test(value)) return -1;
      let offset = 0;
      let found = -1;
      // Retain line endings in the slices, so offsets preserve LF and CRLF bytes.
      for (const line of message.content.split(/(?<=\n)/)) {
        if (line.replace(/\r?\n$/, "") === value) {
          if (found >= 0) return -1;
          found = offset + (after ? line.length : 0);
        }
        offset += line.length;
      }
      return found;
    }
    const index = message.content.indexOf(value);
    return index >= 0 && index === message.content.lastIndexOf(value)
      ? index + (after ? value.length : 0)
      : -1;
  };
  const start = boundary(input.startAfter, 0, true);
  const end = boundary(input.endBefore, message.content.length, false);
  if (start < 0 || end < 0 || start >= end) {
    return {
      success: false,
      error:
        "User-message boundaries must each occur exactly once and select non-empty content in order. In lines mode, use complete marker lines without newline characters. Request clarification if the intended content cannot be selected uniquely.",
    };
  }
  const content = message.content.slice(start, end);
  if (input.contentHash && input.contentHash !== computeContentHash(content)) {
    return {
      success: false,
      error:
        "User-message source changed after the proposal. Request the change again and confirm the new approval.",
    };
  }
  return { success: true, messageId: message.id, content };
}

/** Pins a resolved user-message source to its message and selected text. */
export function freezeUserMessageSource(
  source: UserMessageSource,
  resolved: { messageId: string; content: string },
): UserMessageSource {
  return {
    ...source,
    messageId: resolved.messageId,
    contentHash: computeContentHash(resolved.content),
  };
}
