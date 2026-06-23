export interface CoalescedInputMessage {
  id?: string;
  text: string;
  authorName?: string;
}

export interface CoalescedInputMetadata {
  supersededMessageCount: number;
  supersededMessageIds: string[];
}

export interface CoalescedInputResult {
  message: string;
  metadata?: CoalescedInputMetadata;
}

export function buildCoalescedInput(input: {
  message: string;
  skippedMessages: CoalescedInputMessage[];
}): CoalescedInputResult {
  if (input.skippedMessages.length === 0) {
    return { message: input.message };
  }

  const skippedLines = input.skippedMessages.map(formatSkippedMessageLine);
  const message = [
    "Messages received while the previous response was still running (oldest first, for context only):",
    ...skippedLines,
    "",
    "Latest message to answer:",
    input.message,
  ].join("\n");

  return {
    message,
    metadata: {
      supersededMessageCount: input.skippedMessages.length,
      supersededMessageIds: input.skippedMessages
        .map((message) => message.id)
        .filter((id): id is string => id !== undefined),
    },
  };
}

function formatSkippedMessageLine(message: CoalescedInputMessage): string {
  const text = message.text.trim();
  const author = message.authorName?.trim();
  return author ? `- ${author}: ${text}` : `- ${text}`;
}
