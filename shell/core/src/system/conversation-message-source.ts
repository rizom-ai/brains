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
 * approved text. Only a confirmed call carries an approved hash: on a first
 * request there is no approval yet, so a hash the model filled in is ignored
 * and the proposal pins the hash of the text the server read.
 */
export async function resolveConversationMessageContent(
  services: SystemServices,
  input: ConversationMessageRef,
  toolContext: ToolContext,
  { confirmed }: { confirmed: boolean },
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
    if (!value) return { offset: fallback };
    const quoted = `${name} ${JSON.stringify(value)}`;
    if (input.boundaryMode === "lines" && /[\r\n]/.test(value)) {
      return {
        problem: `${quoted} contains a newline; in lines mode give the marker line's text only`,
      };
    }
    const offsets = boundaryOffsets(
      message.content,
      value,
      input.boundaryMode ?? "literal",
      after,
    );
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
      error: `User-message boundary ${problems.join("; ")}; each boundary must occur exactly once. ${retryAdvice(message.content)}`,
    };
  }
  // Frontmatter only counts at the first byte, so blank lines between an
  // instruction and a pasted document are not part of the document.
  const content = message.content
    .slice(start.offset, end.offset)
    .replace(/^(?:[ \t]*\r?\n)+(?=---\r?\n)/, "");
  const approvedHash = confirmed ? input.contentHash : undefined;
  if (approvedHash && approvedHash !== computeContentHash(content)) {
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
  const { startAfter, endBefore, ...rest } = source;
  return {
    ...rest,
    ...(startAfter ? { startAfter } : {}),
    ...(endBefore ? { endBefore } : {}),
    messageId: resolved.messageId,
    contentHash: computeContentHash(resolved.content),
  };
}

/**
 * Offsets of a boundary's exact occurrences or, when it has none, of its
 * occurrences ignoring whitespace differences: models restate a line break
 * as a space or pad a marker line. Only the excluded boundary is matched
 * loosely; the selected text between boundaries stays byte-exact.
 */
function boundaryOffsets(
  content: string,
  marker: string,
  mode: "literal" | "lines",
  after: boolean,
): number[] {
  if (mode === "lines") {
    const exact = lineBoundaryOffsets(content, marker, after);
    return exact.length > 0 || !marker.trim()
      ? exact
      : lineBoundaryOffsets(content, marker, after, collapseWhitespace);
  }
  const exact = literalBoundaryOffsets(content, marker, after);
  return exact.length > 0
    ? exact
    : looseLiteralBoundaryOffsets(content, marker, after);
}

function collapseWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/**
 * A pasted document that opens with frontmatter is selected by the text
 * before its opening fence. Naming that exact prefix makes the retry certain:
 * models otherwise pick the --- fences themselves as boundaries.
 */
function retryAdvice(content: string): string {
  const fence = /^---\r?$/m.exec(content);
  const prefix = fence ? content.slice(0, fence.index) : "";
  return prefix.trim() &&
    literalBoundaryOffsets(content, prefix, true).length === 1
    ? `--- fences frontmatter, which is part of the content: retry with boundaryMode "literal", startAfter ${JSON.stringify(prefix)} and no endBefore.`
    : "To select everything after an instruction, use boundaryMode literal with startAfter set to the instruction's exact text and omit endBefore.";
}

/** Offsets after (or before) each whole line equal to the marker. */
function lineBoundaryOffsets(
  content: string,
  marker: string,
  after: boolean,
  normalize: (text: string) => string = (text) => text,
): number[] {
  const target = normalize(marker);
  // Retain line endings in the slices, so offsets preserve LF and CRLF bytes.
  return content.split(/(?<=\n)/).reduce<{ offset: number; matches: number[] }>(
    (state, line) => ({
      offset: state.offset + line.length,
      matches:
        normalize(line.replace(/\r?\n$/, "")) === target
          ? [...state.matches, state.offset + (after ? line.length : 0)]
          : state.matches,
    }),
    { offset: 0, matches: [] },
  ).matches;
}

/**
 * Offsets after (or before) each occurrence of the marker's words with any
 * whitespace between them; whitespace at the marker's edges extends the
 * match over whatever whitespace the message has there.
 */
function looseLiteralBoundaryOffsets(
  content: string,
  marker: string,
  after: boolean,
): number[] {
  const words = marker.trim().split(/\s+/);
  if (words.join("") === "" || !/\s/.test(marker)) return [];
  const edge = (present: boolean): string => (present ? "\\s*" : "");
  const pattern = new RegExp(
    edge(/^\s/.test(marker)) +
      words.map(escapeRegExp).join("\\s+") +
      edge(/\s$/.test(marker)),
    "g",
  );
  return Array.from(
    content.matchAll(pattern),
    (match) => match.index + (after ? match[0].length : 0),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
