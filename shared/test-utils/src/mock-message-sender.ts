import { mock } from "bun:test";

interface SentMessage {
  type: string;
  payload: unknown;
}

function createRecordingSend(): {
  send: ReturnType<typeof mock>;
  sentMessages: SentMessage[];
} {
  const sentMessages: SentMessage[] = [];
  const send = mock(async (request: { type: string; payload: unknown }) => {
    sentMessages.push({ type: request.type, payload: request.payload });
    return { success: true };
  });
  return { send, sentMessages };
}

/**
 * Create a mock MessageSender that records sent messages.
 *
 * Returns a mock function matching the MessageSender signature,
 * plus a `sentMessages` array for assertions on what was sent.
 */
export function createMockMessageSender(): {
  sendMessage: ReturnType<typeof mock>;
  sentMessages: SentMessage[];
} {
  const { send, sentMessages } = createRecordingSend();
  return { sendMessage: send, sentMessages };
}

/**
 * Create a mock scheduler-style message publisher (`send`) that records
 * sent messages in a `sentMessages` array for assertions.
 */
export function createMockMessagePublisher(): {
  send: ReturnType<typeof mock>;
  sentMessages: SentMessage[];
} {
  return createRecordingSend();
}
