import { describe, expect, it, mock } from "bun:test";
import { CHAT_CHANNELS, type SpaceNoticeRequest } from "@brains/contracts";
import {
  MockChatSdk,
  createPlugin,
  setupChatInterfaceTest,
  stubFetch,
} from "./harness/chat-interface-harness";

const CHANNEL = "discord:guild-123:channel-123";

const request: SpaceNoticeRequest = {
  channelId: CHANNEL,
  interfaceType: "discord",
  title: "Added to the board",
  lines: ["Send INC the proposal · Jo", "Book the venue"],
  actions: [
    { label: "Undo: Send INC the proposal", value: "card-1" },
    { label: "Undo: Book the venue", value: "card-2" },
  ],
  actionChannel: "conversation-memory:channel-notice-action",
  reactions: [
    { messageId: "message-12", emoji: "📌" },
    { messageId: "message-14", emoji: "📌" },
  ],
};

describe("ChatInterface space notices", () => {
  const suite = setupChatInterfaceTest();

  it("posts the notice into the space with a button per action and pins its messages", async () => {
    const fetched = mock(
      (_input: string | URL | Request, _init?: RequestInit) =>
        Promise.resolve(new Response(null, { status: 204 })),
    );
    stubFetch(fetched);
    await suite.harness.installPlugin(createPlugin());

    const response = await suite.harness.sendMessage(
      CHAT_CHANNELS.spaceNotice,
      request,
      "conversation-memory",
    );

    const channel = MockChatSdk.instances[0]?.channels.get(CHANNEL);
    expect(channel?.post).toHaveBeenCalledWith({
      card: {
        type: "card",
        title: "Added to the board",
        children: [
          { type: "text", content: "Send INC the proposal · Jo" },
          { type: "text", content: "Book the venue" },
          {
            type: "actions",
            children: [
              {
                type: "button",
                id: "chat.space-notice",
                label: "Undo: Send INC the proposal",
                value: "card-1",
              },
              {
                type: "button",
                id: "chat.space-notice",
                label: "Undo: Book the venue",
                value: "card-2",
              },
            ],
          },
        ],
      },
    });
    expect(response).toEqual({ messageId: "posted-1" });
    const pinned = fetched.mock.calls.map(([input, init]) => [
      String(input),
      init?.method,
    ]);
    expect(pinned).toEqual([
      [
        `https://discord.com/api/v10/channels/channel-123/messages/message-12/reactions/${encodeURIComponent("📌")}/@me`,
        "PUT",
      ],
      [
        `https://discord.com/api/v10/channels/channel-123/messages/message-14/reactions/${encodeURIComponent("📌")}/@me`,
        "PUT",
      ],
    ]);
  });

  it("refuses a request that is not a space notice", async () => {
    await suite.harness.installPlugin(createPlugin());

    const response = await suite.harness.sendMessage(
      CHAT_CHANNELS.spaceNotice,
      { channelId: CHANNEL },
      "conversation-memory",
    );

    expect(response).toBeUndefined();
    expect(MockChatSdk.instances[0]?.channels.get(CHANNEL)).toBeUndefined();
  });
});
