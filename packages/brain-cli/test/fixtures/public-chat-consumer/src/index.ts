import {
  chatContextHandoffRequestSchema,
  chatMessageRequestSchema,
  chatProtocolEventSchema,
  createChatClient,
  readChatProtocolEvents,
  type ChatClient,
  type ChatFetch,
} from "@rizom/brain/chat";

export function createConsumerChatClient(fetch: ChatFetch): ChatClient {
  return createChatClient({ fetch });
}

export const protocolEvent = chatProtocolEventSchema.parse({
  type: "text-delta",
  id: "fixture-text",
  delta: "Hello",
});

export const readConsumerChatEvents = readChatProtocolEvents;

export const messageRequest = chatMessageRequestSchema.parse({
  id: "fixture-session",
  messages: [
    {
      id: "fixture-message",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    },
  ],
});

export const handoffRequest = chatContextHandoffRequestSchema.parse({
  version: 1,
  sourceId: "fixture-source",
  itemId: "fixture-item",
  titleSeed: "Discuss fixture item",
});
