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

  // Name the failing boundary and the way out: a generic refusal led models
  // to ask the user to resend content that a literal prefix selects uniquely.
  const boundary = (
    name: "startAfter" | "endBefore",
    value: string | undefined,
    fallback: number,
    after: boolean,
  ): { offset: number } | { problem: string } => {
    if (value === undefined) return { offset: fallback };
    const quoted = `${name} ${JSON.stringify(value)}`;
    if (value === "") return { problem: `${quoted} is empty` };
    if (input.boundaryMode === "lines" && /[\r\n]/.test(value)) {
      return {
        problem: `${quoted} contains a newline; in lines mode give the marker line's text only`,
      };
    }
    const offsets =
      input.boundaryMode === "lines"
        ? lineBoundaryOffsets(message.content, value, after)
        : literalBoundaryOffsets(message.content, value, after);
    const [offset] = offsets;
    if (offsets.length === 1 && offset !== undefined) return { offset };
    return {
      problem:
        offsets.length === 0
          ? `${quoted} does not occur in the message`
          : `${quoted} occurs ${offsets.length} times in the message`,
    };
  };
  const start = boundary("startAfter", input.startAfter, 0, true);
  const end = boundary(
    "endBefore",
    input.endBefore,
    message.content.length,
    false,
  );
  const problems = [start, end].flatMap((match) =>
    "problem" in match ? [match.problem] : [],
  );
  if (
    problems.length === 0 &&
    "offset" in start &&
    "offset" in end &&
    start.offset >= end.offset
  ) {
    problems.push(
      "startAfter must come before endBefore with content between them",
    );
  }
  if (!("offset" in start) || !("offset" in end) || problems.length > 0) {
    return {
      success: false,
      error: `User-message boundary ${problems.join("; ")}; each boundary must occur exactly once. To select everything after an instruction, use boundaryMode literal with startAfter set to the instruction's exact text and omit endBefore.`,
    };
  }
  const content = message.content.slice(start.offset, end.offset);
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

/** Offsets after (or before) each whole line equal to the marker. */
function lineBoundaryOffsets(
  content: string,
  marker: string,
  after: boolean,
): number[] {
  // Retain line endings in the slices, so offsets preserve LF and CRLF bytes.
  return content.split(/(?<=\n)/).reduce<{ offset: number; matches: number[] }>(
    (state, line) => ({
      offset: state.offset + line.length,
      matches:
        line.replace(/\r?\n$/, "") === marker
          ? [...state.matches, state.offset + (after ? line.length : 0)]
          : state.matches,
    }),
    { offset: 0, matches: [] },
  ).matches;
}

/** Offsets after (or before) each literal occurrence of a non-empty marker. */
function literalBoundaryOffsets(
  content: string,
  marker: string,
  after: boolean,
  from = 0,
): number[] {
  const index = content.indexOf(marker, from);
  if (index < 0) return [];
  return [
    index + (after ? marker.length : 0),
    ...literalBoundaryOffsets(content, marker, after, index + 1),
  ];
}
