import { mock } from "bun:test";

/**
 * Create a mock MessageSender that records sent messages.
 *
 * Returns a mock function matching the MessageSender signature,
 * plus a `_sentMessages` array for assertions on what was sent.
 */
export function createMockMessageSender(): {
  sendMessage: ReturnType<typeof mock>;
  _sentMessages: Array<{ type: string; payload: unknown }>;
} {
  const sentMessages: Array<{ type: string; payload: unknown }> = [];
  const sendFn = mock(
    async (type: string, payload: unknown, _options?: unknown) => {
      sentMessages.push({ type, payload });
      return { success: true };
    },
  );
  return { sendMessage: sendFn, _sentMessages: sentMessages };
}
