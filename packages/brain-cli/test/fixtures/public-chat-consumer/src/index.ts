import {
  browserChatContextHandoffRequestSchema,
  browserChatMessageRequestSchema,
  createBrowserChatClient,
  type BrowserChatClient,
  type BrowserChatFetch,
} from "@rizom/brain/chat";

export function createConsumerChatClient(
  fetch: BrowserChatFetch,
): BrowserChatClient {
  return createBrowserChatClient({ fetch });
}

export const messageRequest = browserChatMessageRequestSchema.parse({
  id: "fixture-session",
  messages: [
    {
      id: "fixture-message",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    },
  ],
});

export const handoffRequest = browserChatContextHandoffRequestSchema.parse({
  version: 1,
  sourceId: "fixture-source",
  itemId: "fixture-item",
  titleSeed: "Discuss fixture item",
});
