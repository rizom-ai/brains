import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  CONVERSATION_MESSAGE_ADDED_CHANNEL,
  CONVERSATION_STARTED_CHANNEL,
  ConversationService,
  RemoteConversationService,
  handleConversationRpcRequest,
  type ConversationRpcRequest,
  type ConversationRpcTransport,
} from "../src";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";
import type { Logger } from "@brains/utils/logger";
import { createTestConversationDatabase } from "./helpers/test-conversation-db";

class DirectConversationTransport implements ConversationRpcTransport {
  private readonly owner: ConversationService;
  public initialized = false;

  public constructor(owner: ConversationService) {
    this.owner = owner;
  }

  public async initialize(): Promise<void> {
    this.initialized = true;
  }

  public request(payload: ConversationRpcRequest): Promise<unknown> {
    return handleConversationRpcRequest(this.owner, payload);
  }

  public close(): void {}
}

function captureThrown(invocation: () => unknown): Error {
  try {
    invocation();
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
  throw new Error("Expected invocation to throw");
}

describe("conversation owner RPC", () => {
  let cleanup: () => Promise<void>;
  let owner: ConversationService;
  let remote: RemoteConversationService;
  let transport: DirectConversationTransport;
  let logger: Logger;
  let ownerBus: MessageBus;

  beforeEach(async () => {
    const database = await createTestConversationDatabase();
    cleanup = database.cleanup;
    logger = createSilentLogger("conversation-rpc-test");
    ownerBus = MessageBus.createFresh(logger);
    owner = ConversationService.createFresh(database.db, logger, ownerBus);
    transport = new DirectConversationTransport(owner);
    remote = new RemoteConversationService(transport);
    await remote.initialize();
  });

  afterEach(async () => {
    remote.close();
    await cleanup();
  });

  it("routes the complete durable conversation surface", async () => {
    const conversationId = await remote.startConversation({
      sessionId: "worker-session",
      interfaceType: "worker",
      channelId: "worker-channel",
      personId: "person-1",
      metadata: {
        channelName: "Worker channel",
        interfaceType: "worker",
        channelId: "worker-channel",
      },
    });
    await remote.addMessage({
      conversationId,
      role: "user",
      content: "searchable worker message",
      metadata: { source: "worker" },
    });

    expect(transport.initialized).toBe(true);
    expect(await remote.countMessages(conversationId)).toBe(1);
    expect(await remote.getMessages(conversationId)).toMatchObject([
      { role: "user", content: "searchable worker message" },
    ]);
    expect(await remote.getConversation(conversationId)).toMatchObject({
      id: conversationId,
      personId: "person-1",
    });
    expect(
      await remote.listConversations({
        interfaceType: "worker",
        personId: "person-1",
      }),
    ).toHaveLength(1);
    expect(
      await remote.searchConversations("searchable", conversationId),
    ).toHaveLength(1);
    expect(
      await remote.updateConversationMetadata({
        conversationId,
        metadata: { title: "Remote title" },
      }),
    ).toBe(true);
    expect(await remote.deleteConversation(conversationId)).toBe(true);
    expect(await remote.getConversation(conversationId)).toBeNull();
  });

  it("emits each durable event once in the owner process", async () => {
    let startedEvents = 0;
    let messageEvents = 0;
    ownerBus.subscribe(CONVERSATION_STARTED_CHANNEL, async () => {
      startedEvents++;
      return { success: true };
    });
    ownerBus.subscribe(CONVERSATION_MESSAGE_ADDED_CHANNEL, async () => {
      messageEvents++;
      return { success: true };
    });

    const request = {
      sessionId: "event-session",
      interfaceType: "worker",
      channelId: "event-channel",
      metadata: {
        channelName: "Events",
        interfaceType: "worker",
        channelId: "event-channel",
      },
    };
    await remote.startConversation(request);
    await remote.startConversation(request);
    await remote.addMessage({
      conversationId: request.sessionId,
      role: "assistant",
      content: "owner event",
    });

    expect(startedEvents).toBe(1);
    expect(messageEvents).toBe(1);
  });

  it("rejects malformed operations before owner dispatch", () => {
    const error = captureThrown(() =>
      handleConversationRpcRequest(owner, {
        operation: "addMessage",
        request: {
          conversationId: "event-session",
          role: "system",
          content: "invalid role",
        },
      }),
    );
    expect(error.name).toBe("ZodError");
  });
});
