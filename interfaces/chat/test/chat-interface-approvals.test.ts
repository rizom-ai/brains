import { describe, it, expect, mock } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createFetchStub,
  createMessage,
  createPlugin,
  createSentMessage,
  createThread,
  expectDiscordConfirmationContext,
  setupChatInterfaceTest,
  withToolActivity,
} from "./harness/chat-interface-harness";
import type {
  MockPostMessage,
  MockSentMessage,
} from "./harness/chat-interface-harness";

describe("ChatInterface approvals", () => {
  const suite = setupChatInterfaceTest();

  it("posts single pending approvals as concise SDK cards with yes/no fallback", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "tool-approval",
          id: "approval-card-1",
          toolName: "system_delete",
          summary: "Delete thing",
          preview: "This will delete the thing.",
          state: "approval-requested",
          input: { entityId: "thing-1" },
        },
      ],
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    expect(thread.post).toHaveBeenNthCalledWith(1, "Please confirm.");
    expect(thread.post.mock.calls[0]?.[0]).not.toContain("Approval:");
    expect(thread.post.mock.calls[0]?.[0]).not.toContain("approval-requested");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Approval required: Delete thing\nReply yes to confirm or no/cancel to abort.",
        card: expect.objectContaining({
          type: "card",
          title: "Approval required",
          children: expect.arrayContaining([
            expect.objectContaining({ type: "text", content: "Delete thing" }),
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "button",
                  id: "approval.confirm",
                  label: "Confirm",
                  value: "approval-1",
                }),
                expect.objectContaining({
                  type: "button",
                  id: "approval.cancel",
                  label: "Cancel",
                  value: "approval-1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Approved · Action confirmed.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
  });

  it("posts native Slack approval cards without generic confirmation chatter", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Confirmation required.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        fallbackText:
          "Approval required: Delete thing\nReply yes to confirm or no/cancel to abort.",
        card: expect.objectContaining({
          title: "Approval required",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  id: "approval.confirm",
                  value: "approval-1",
                }),
                expect.objectContaining({
                  id: "approval.cancel",
                  value: "approval-1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", threadId: thread.id, isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      `slack-${thread.id}`,
      true,
      "approval-1",
      expect.objectContaining({
        interfaceType: "slack",
        channelId: thread.id,
        userPermissionLevel: "public",
      }),
    );
    expect(thread.post).toHaveBeenCalledTimes(1);
  });

  it("confirms Slack approvals from native card buttons and resolves the card", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const approvalMessage = createSentMessage("slack-approval-message-1");
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) =>
        Promise.resolve(approvalMessage),
      ),
    });

    const actionEvent = {
      actionId: "approval.confirm",
      adapter: { name: "slack" },
      messageId: "slack-approval-message-1",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    };

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    expect(thread.post).toHaveBeenCalledTimes(1);
    await chat?.handlers.actions[0]?.handler(actionEvent);

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      `slack-${thread.id}`,
      true,
      "approval-1",
      expect.objectContaining({
        channelId: thread.id,
        interfaceType: "slack",
        userPermissionLevel: "public",
        actor: expect.objectContaining({
          identity: expect.objectContaining({ kind: "external" }),
        }),
        source: expect.objectContaining({
          messageId: "slack-approval-message-1",
          metadata: expect.objectContaining({
            actionId: "approval.confirm",
            actionValue: "approval-1",
          }),
        }),
      }),
    );
    expect(approvalMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Approval confirmed: Delete thing",
        card: expect.objectContaining({
          title: "Approval confirmed",
          children: expect.not.arrayContaining([
            expect.objectContaining({ type: "actions" }),
          ]),
        }),
      }),
    );
    expect(thread.post).toHaveBeenCalledTimes(1);

    await chat?.handlers.actions[0]?.handler(actionEvent);
    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "That approval is no longer pending.",
      }),
    );
  });

  it("consolidates confirmed queued Slack artifacts into the card and progress message", async () => {
    suite.harness.addEntities([
      {
        id: "queued-slack-image",
        entityType: "image",
        content: `data:image/png;base64,${Buffer.from("pending-placeholder").toString("base64")}`,
        metadata: { status: "pending" },
        visibility: "shared",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "slack:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Confirmation required.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_generate",
          summary: "Generate image?",
          args: {},
        },
      ],
    });
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "Completed: Generate image",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "tool-approval",
          id: "approval-1",
          toolName: "system_generate",
          summary: "Generate image?",
          state: "output-available",
          output: { success: true },
        },
        {
          kind: "attachment",
          id: "queued-image-card",
          jobId: "queued-image-job",
          title: "queued-slack-image.png",
          description: "Image generation has been queued.",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=queued-slack-image",
            filename: "queued-slack-image.png",
            source: {
              entityType: "image",
              entityId: "queued-slack-image",
            },
          },
        },
      ],
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.confirm",
      adapter: { name: "slack" },
      messageId: "slack-approval-message-1",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    });

    expect(thread.post).toHaveBeenCalledTimes(2);
    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        card: expect.objectContaining({ title: "Approval required" }),
      }),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      "Artifact: queued-slack-image.png\nImage generation has been queued.\nFile: queued-slack-image.png\nType: image/png",
    );
  });

  it("consolidates successful Slack approvals into the resolved card", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    const toolInterface = withToolActivity(plugin);
    const threadId = "slack:C123:1712345678.000100";
    suite.agentService.chat.mockImplementationOnce(
      async (_message, conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:invoking",
          toolName: "system_create",
          conversationId,
          interfaceType: "slack",
          channelId: threadId,
        });
        await toolInterface.handleToolActivityEvent({
          type: "tool:completed",
          toolName: "system_create",
          conversationId,
          interfaceType: "slack",
          channelId: threadId,
        });
        return {
          text: "Confirmation required.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          pendingConfirmations: [
            {
              id: "approval-1",
              toolName: "system_create",
              summary: "Create note?",
              args: {},
            },
          ],
        };
      },
    );
    suite.agentService.confirmPendingAction.mockImplementationOnce(
      async (conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:invoking",
          toolName: "system_create",
          conversationId,
          interfaceType: "slack",
          channelId: threadId,
        });
        await toolInterface.handleToolActivityEvent({
          type: "tool:completed",
          toolName: "system_create",
          conversationId,
          interfaceType: "slack",
          channelId: threadId,
        });
        return {
          text: "Completed: Create note",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          cards: [
            {
              kind: "tool-approval" as const,
              id: "approval-1",
              toolName: "system_create",
              summary: "Create note?",
              state: "output-available" as const,
              output: { success: true },
            },
          ],
        };
      },
    );
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const sentMessages: MockSentMessage[] = [];
    const thread = createThread({
      id: threadId,
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) => {
        const sent = createSentMessage(
          `slack-message-${sentMessages.length + 1}`,
        );
        sentMessages.push(sent);
        return Promise.resolve(sent);
      }),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(sentMessages[0]?.delete).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenCalledTimes(2);
    const approvalMessage = sentMessages[1];

    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.confirm",
      adapter: { name: "slack" },
      messageId: approvalMessage?.id ?? "",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    });

    expect(approvalMessage?.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Approval confirmed: Create note?",
      }),
    );
    expect(thread.post).toHaveBeenCalledTimes(2);
  });

  it("consolidates cancelled Slack approvals into the resolved card", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Approval required.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_create",
          summary: "Create note?",
          args: {},
        },
      ],
    });
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "Action cancelled.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const approvalMessage = createSentMessage("slack-cancel-approval");
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) =>
        Promise.resolve(approvalMessage),
      ),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.cancel",
      adapter: { name: "slack" },
      messageId: approvalMessage.id,
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    });

    expect(approvalMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({ title: "Approval declined" }),
      }),
    );
    expect(thread.post).toHaveBeenCalledTimes(1);
  });

  it("consolidates failed Slack approvals into the resolved card", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    const toolInterface = withToolActivity(plugin);
    const threadId = "slack:C123:1712345678.000100";
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm this action.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_create",
          summary: "Create note?",
          args: {},
        },
      ],
    });
    suite.agentService.confirmPendingAction.mockImplementationOnce(
      async (conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:failed",
          toolName: "system_create",
          conversationId,
          interfaceType: "slack",
          channelId: threadId,
          error: "Upload ref not found",
        });
        return {
          text: "Failed: Create note",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          cards: [
            {
              kind: "tool-approval" as const,
              id: "approval-1",
              toolName: "system_create",
              summary: "Create note?",
              state: "output-error" as const,
              error: "Upload ref not found",
            },
          ],
        };
      },
    );
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const approvalMessage = createSentMessage("slack-failed-approval");
    const thread = createThread({
      id: threadId,
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) =>
        Promise.resolve(approvalMessage),
      ),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.confirm",
      adapter: { name: "slack" },
      messageId: approvalMessage.id,
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    });

    expect(approvalMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        card: expect.objectContaining({ title: "Action failed" }),
      }),
    );
    expect(thread.post).toHaveBeenCalledTimes(1);
  });

  it("blocks Slack approval buttons when DMs are disabled", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete thing",
          args: {},
        },
      ],
    });
    const plugin = new ChatInterface({
      adapters: { slack: { ...baseSlackConfig, allowDMs: false } },
    });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:D123:1712345678.000100",
      channelId: "slack:D123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.isDM = true;
    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.confirm",
      adapter: { name: "slack" },
      messageId: "slack-approval-message-1",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "user-789",
        userName: "mira",
        fullName: "Mira Ops",
        isBot: false,
        isMe: false,
      },
      value: "approval-1",
    });

    expect(suite.agentService.confirmPendingAction).not.toHaveBeenCalled();
  });

  it("requires explicit ids for multiple Slack approvals", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Choose one.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ],
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    expect(thread.post).toHaveBeenCalledWith(
      "Approvals pending:\napproval-1: Publish one\napproval-2: Publish two\nReply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
    );

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", threadId: thread.id, isMention: false }),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      "Multiple approvals are pending; include one approval id with yes or no/cancel: approval-1, approval-2.",
    );
    expect(suite.agentService.confirmPendingAction).not.toHaveBeenCalled();

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "yes approval-2",
        threadId: thread.id,
        isMention: false,
      }),
    );
    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      `slack-${thread.id}`,
      true,
      "approval-2",
      expect.objectContaining({ interfaceType: "slack" }),
    );
  });

  it("passes topic changes during pending confirmation through to chat", async () => {
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "Please confirm.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "system_delete",
            summary: "Delete thing",
            args: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Fresh topic answer.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "actually tell me about Rover", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).not.toHaveBeenCalled();
    expect(suite.agentService.chat).toHaveBeenNthCalledWith(
      2,
      "actually tell me about Rover",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        userPermissionLevel: "public",
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Fresh topic answer.");
  });

  it("resolves approval cards in the matching conversation when approval ids collide", async () => {
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "Please confirm first.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "system_delete",
            summary: "Delete first thing",
            args: {},
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Please confirm second.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        pendingConfirmations: [
          {
            id: "approval-1",
            toolName: "system_delete",
            summary: "Delete second thing",
            args: {},
          },
        ],
      });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const firstApprovalMessage = createSentMessage("first-approval-message");
    const secondApprovalMessage = createSentMessage("second-approval-message");
    let firstPostCount = 0;
    let secondPostCount = 0;
    const firstThread = createThread({
      post: mock((_message: MockPostMessage) => {
        firstPostCount += 1;
        return Promise.resolve(
          firstPostCount === 2 ? firstApprovalMessage : createSentMessage(),
        );
      }),
    });
    const secondThread = createThread({
      id: "discord:guild-123:channel-999:thread-999",
      channelId: "discord:guild-123:channel-999",
      post: mock((_message: MockPostMessage) => {
        secondPostCount += 1;
        return Promise.resolve(
          secondPostCount === 2 ? secondApprovalMessage : createSentMessage(),
        );
      }),
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = createFetchStub(originalFetch, () =>
      Promise.resolve(new Response("{}")),
    );

    try {
      await chat?.handlers.mentions[0]?.(firstThread, createMessage());
      await chat?.handlers.mentions[0]?.(
        secondThread,
        createMessage({
          threadId: "discord:guild-123:channel-999:thread-999",
          raw: { guild_id: "guild-123", channel_id: "channel-999" },
        }),
      );
      await chat?.handlers.subscribedMessages[0]?.(
        firstThread,
        createMessage({ text: "yes", isMention: false }),
      );

      expect(firstApprovalMessage.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackText: "Approval confirmed: Delete first thing",
        }),
      );
      expect(secondApprovalMessage.edit).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
