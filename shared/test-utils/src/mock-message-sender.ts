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
 * Create a mock scheduler-style message publisher (`broadcast` and `command`)
 * that records what it sends, each under its channel's name, in a
 * `sentMessages` array for assertions. A broadcast is parsed by its channel
 * as the messaging namespace parses it: a payload the channel refuses throws
 * and is not recorded, and the parsed payload is what is recorded.
 */
export function createMockMessagePublisher(): {
  broadcast: ReturnType<typeof mock>;
  command: ReturnType<typeof mock>;
  sentMessages: SentMessage[];
} {
  const sentMessages: SentMessage[] = [];
  const broadcast = mock(
    async (
      channel: {
        name: string;
        schema: {
          safeParse(
            input: unknown,
          ): { success: true; data: unknown } | { success: false };
        };
      },
      payload: unknown,
    ) => {
      const parsed = channel.schema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(`Refused a payload ${channel.name} refuses`);
      }
      sentMessages.push({ type: channel.name, payload: parsed.data });
    },
  );
  const command = mock(async (contract: { name: string }, payload: unknown) => {
    sentMessages.push({ type: contract.name, payload });
  });
  return { broadcast, command, sentMessages };
}
