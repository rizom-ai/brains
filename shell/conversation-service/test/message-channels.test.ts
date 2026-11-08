import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { guestInterfaceType } from "@brains/contracts/chat";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { ConversationService } from "../src/conversation-service";
import {
  CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  conversationGuestMessageAddedChannel,
  conversationMessageAddedChannel,
} from "../src/types";
import { createTestConversationDatabase } from "./helpers/test-conversation-db";

const sentRequest = z.object({ type: z.string(), payload: z.unknown() });

// A channel is the contract between the conversation service and every plugin
// that follows its messages: what the service sends must be what it takes.
describe("conversation message channels", () => {
  let service: ConversationService;
  let messageBus: MessageBus;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const testDb = await createTestConversationDatabase();
    cleanup = testDb.cleanup;
    const logger = createSilentLogger();
    messageBus = MessageBus.createFresh(logger);
    service = ConversationService.createFresh(testDb.db, logger, messageBus);
  });

  afterEach(async () => {
    await cleanup();
  });

  function sent(
    calls: ReadonlyArray<readonly unknown[]>,
  ): z.output<typeof sentRequest>[] {
    return calls.map(([request]) => sentRequest.parse(request));
  }

  it("names the message events", () => {
    expect(conversationMessageAddedChannel.name).toBe(
      CONVERSATION_MESSAGE_ADDED_CHANNEL,
    );
    expect(conversationGuestMessageAddedChannel.name).toBe(
      CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL,
    );
  });

  it("takes every message the service announces, with its metadata", async () => {
    await service.startConversation({
      sessionId: "room",
      interfaceType: "discord",
      channelId: "discord:1466",
      metadata: {
        channelName: "Room",
        interfaceType: "discord",
        channelId: "discord:1466",
      },
    });
    const send = spyOn(messageBus, "send");
    await service.addMessage({
      conversationId: "room",
      role: "user",
      content: "What did we decide?",
      metadata: { spaceId: "discord:1466" },
    });
    await service.addMessage({
      conversationId: "room",
      role: "assistant",
      content: "To ship on Friday.",
    });

    const added = sent(send.mock.calls);
    expect(added.map(({ type }) => type)).toEqual([
      CONVERSATION_MESSAGE_ADDED_CHANNEL,
      CONVERSATION_MESSAGE_ADDED_CHANNEL,
    ]);
    const [question, answer] = added.map(({ payload }) =>
      conversationMessageAddedChannel.schema.safeParse(payload),
    );
    expect(question).toMatchObject({
      success: true,
      data: {
        conversationId: "room",
        role: "user",
        content: "What did we decide?",
        metadata: { spaceId: "discord:1466" },
      },
    });
    expect(answer).toMatchObject({
      success: true,
      data: { conversationId: "room", role: "assistant" },
    });
  });

  it("takes a guest message's place, which is all it announces", async () => {
    await service.startConversation({
      sessionId: "visitor",
      interfaceType: guestInterfaceType,
      channelId: "visitor",
      metadata: {
        channelName: "Visitor",
        interfaceType: guestInterfaceType,
        channelId: "visitor",
        guest: {
          visitorId: "10c15c16-919e-4481-8fd4-07f11555a994",
          retention: { idleSeconds: 86400, maxAgeSeconds: 604800 },
        },
      },
    });
    const send = spyOn(messageBus, "send");
    await service.addMessage({
      conversationId: "visitor",
      role: "assistant",
      content: "Mostly about institutions.",
    });

    const [guest] = sent(send.mock.calls);
    expect(guest?.type).toBe(CONVERSATION_GUEST_MESSAGE_ADDED_CHANNEL);
    expect(
      conversationGuestMessageAddedChannel.schema.safeParse(guest?.payload),
    ).toMatchObject({
      success: true,
      data: { conversationId: "visitor", role: "assistant", position: 1 },
    });
  });

  it.each([
    ["no message id", { conversationId: "room", role: "user", content: "" }],
    [
      "an unknown role",
      {
        conversationId: "room",
        messageId: "m1",
        role: "system",
        content: "",
        timestamp: "2026-11-07T00:00:00.000Z",
      },
    ],
  ])("refuses a message with %s", (_case, payload) => {
    expect(
      conversationMessageAddedChannel.schema.safeParse(payload).success,
    ).toBe(false);
  });
});
