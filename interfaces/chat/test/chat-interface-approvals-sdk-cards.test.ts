import { describe, it, expect, mock } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import {
  MockChatSdk,
  createFetchStub,
  createMessage,
  createPlugin,
  createSentMessage,
  createThread,
  discordExternalIdentity,
  expectDiscordConfirmationContext,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";
import type {
  MockActionEvent,
  MockPostMessage,
} from "./harness/chat-interface-harness";

describe("ChatInterface SDK card approvals", () => {
  const suite = setupChatInterfaceTest();

  it("confirms pending approvals from SDK card buttons and removes the buttons", async () => {
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
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const approvalMessage = createSentMessage("approval-message-1");
    const resultMessage = createSentMessage("result-message-1");
    let postCount = 0;
    const thread = createThread({
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 2 ? approvalMessage : resultMessage,
        );
      }),
    });
    const originalFetch = globalThis.fetch;
    const fetchMock = mock((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response("{}")),
    );
    globalThis.fetch = createFetchStub(originalFetch, (input, init) =>
      fetchMock(String(input), init ?? undefined),
    );

    try {
      await chat?.handlers.mentions[0]?.(thread, createMessage());
      await chat?.handlers.actions[0]?.handler({
        actionId: "approval.confirm",
        adapter: { name: "discord" },
        messageId: "approval-message-1",
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
      } as MockActionEvent);

      expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
        "discord-discord:guild-123:channel-123:thread-456",
        true,
        "approval-1",
        expect.objectContaining({
          channelId: "discord:guild-123:channel-123:thread-456",
          channelName: "discord:guild-123:channel-123",
          interfaceType: "discord",
          userPermissionLevel: "public",
          actor: expect.objectContaining({
            identity: discordExternalIdentity,
            displayName: "Mira Ops",
            username: "mira",
          }),
          source: expect.objectContaining({
            messageId: "approval-message-1",
            channelId: "discord:guild-123:channel-123:thread-456",
            threadId: "thread-456",
            metadata: expect.objectContaining({
              actionId: "approval.confirm",
              actionValue: "approval-1",
              guildId: "guild-123",
            }),
          }),
        }),
      );
      expect(approvalMessage.edit).toHaveBeenCalledWith(
        expect.objectContaining({
          fallbackText: "Approval confirmed: Delete thing",
          card: expect.objectContaining({
            type: "card",
            title: "Approval confirmed",
            children: expect.not.arrayContaining([
              expect.objectContaining({ type: "actions" }),
            ]),
          }),
        }),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "https://discord.com/api/v10/channels/thread-456/messages/approval-message-1",
        expect.objectContaining({
          method: "PATCH",
          headers: expect.objectContaining({
            Authorization: "Bot discord-token",
            "Content-Type": "application/json",
          }),
          body: JSON.stringify({ components: [] }),
        }),
      );
      expect(thread.post).toHaveBeenLastCalledWith(
        expect.objectContaining({
          fallbackText: "Approved · Action confirmed.",
          card: expect.objectContaining({ title: "Approval confirmed" }),
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("does not confirm approval button actions when Discord DMs are disabled", async () => {
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
    const plugin = createPlugin({ allowDMs: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.isDM = true;
    await chat?.handlers.actions[0]?.handler({
      actionId: "approval.confirm",
      adapter: { name: "discord" },
      messageId: "approval-message-1",
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
    } as MockActionEvent);

    expect(suite.agentService.confirmPendingAction).not.toHaveBeenCalled();
  });

  it("continues chained pending confirmations returned by a confirmed action", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_delete",
          summary: "Delete first thing",
          args: {},
        },
      ],
    });
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "First action confirmed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-2",
          toolName: "system_delete",
          summary: "Delete second thing",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      1,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(suite.agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      2,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        fallbackText: "Approved · First action confirmed.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        fallbackText:
          "Approval required: Delete second thing\nReply yes to confirm or no/cancel to abort.",
        card: expect.objectContaining({
          type: "card",
          title: "Approval required",
        }),
      }),
    );
  });

  it("syncs pending confirmations returned by a confirmed action", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
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
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "First action confirmed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-2",
          toolName: "system_publish",
          summary: "Publish two",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "No matching pending approval id. Pending approval ids: approval-2.",
        card: expect.objectContaining({ title: "Approval notice" }),
      }),
    );
  });

  it("does not re-add a resolved approval returned by a stale response", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
      ],
    });
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "Action confirmed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledTimes(2);
    expect(suite.agentService.chat.mock.calls[1]?.[0]).toBe("yes");
  });

  it("clears pending confirmations when confirmed action returns an empty pending list", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
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
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "All actions resolved.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat).toHaveBeenCalledTimes(2);
    expect(suite.agentService.chat.mock.calls[1]?.[0]).toBe("yes approval-2");
  });

  it("keeps pending confirmations open when confirmation handling throws", async () => {
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
    suite.agentService.confirmPendingAction.mockRejectedValueOnce(
      new Error("Temporary approval failure"),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledTimes(2);
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Message failed: Temporary approval failure",
        card: expect.objectContaining({ title: "Message failed" }),
      }),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Approved · Action confirmed.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
  });

  it("cancels pending confirmations in the same conversation", async () => {
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
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "cancel", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      false,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Declined",
        card: expect.objectContaining({ title: "Approval declined" }),
      }),
    );
  });

  it("posts native Discord files for trusted artifacts returned by confirmations", async () => {
    suite.harness.addEntities([
      {
        id: "confirmed-deck",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF confirmed").toString("base64")}`,
        metadata: { filename: "confirmed-deck.pdf" },
        visibility: "shared",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Approval required.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "generate_deck",
          summary: "Generate deck",
          args: {},
        },
      ],
    });
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: "Deck generated.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Confirmed deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=confirmed-deck",
            filename: "confirmed-deck.pdf",
            source: { entityType: "document", entityId: "confirmed-deck" },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.mentions[0]?.(thread, createMessage({ text: "yes" }));

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            filename: "confirmed-deck.pdf",
            mimeType: "application/pdf",
          }),
        ],
      }),
    );
  });

  it("summarizes failed confirmed actions without raw JSON", async () => {
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
    suite.agentService.confirmPendingAction.mockResolvedValueOnce({
      text: 'Completed: Delete thing\n\nResult: {\n  "success": false,\n  "error": "Entity not found: base/woodchuck-note"\n}',
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [
        {
          toolName: "system_delete",
          data: {
            success: false,
            error: "Entity not found: base/woodchuck-note",
          },
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );

    expect(thread.post).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fallbackText: "Delete failed · Entity not found: base/woodchuck-note",
        card: expect.objectContaining({ title: "Action failed" }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls.at(-1)?.[0])).not.toContain(
      '"success"',
    );
  });

  it("passes unrecognized replies during pending confirmation through to chat", async () => {
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
        text: "Maybe answer.",
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
      createMessage({ text: "maybe", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).not.toHaveBeenCalled();
    expect(suite.agentService.chat).toHaveBeenNthCalledWith(
      2,
      "maybe",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        channelId: "discord:guild-123:channel-123:thread-456",
        channelName: "discord:guild-123:channel-123",
        interfaceType: "discord",
        userPermissionLevel: "public",
      }),
    );
    expect(thread.post).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Please reply with yes to confirm or no/cancel to abort.",
      }),
    );
    expect(thread.post).toHaveBeenCalledWith("Maybe answer.");
  });

  it("requires an approval id when multiple confirmations are pending", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
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
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    expect(thread.post).toHaveBeenCalledWith("Please confirm.");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Approvals pending:\napproval-1: Publish one\napproval-2: Publish two\nReply yes <approval-id> to confirm one item, or no <approval-id> to abort it.",
        card: expect.objectContaining({ title: "Approvals pending" }),
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Multiple approvals are pending; include one approval id with yes or no/cancel: approval-1, approval-2.",
        card: expect.objectContaining({ title: "Approval notice" }),
      }),
    );
    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
  });

  it("keeps remaining approvals pending after approving one of many", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
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
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      1,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(suite.agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      2,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Approved · Action confirmed.\n\nRemaining pending approval ids: `approval-2`.",
        card: expect.objectContaining({ title: "Approval confirmed" }),
      }),
    );
  });

  it("keeps remaining approvals pending after cancelling one of many", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
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
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "no approval-1", isMention: false }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-2", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      1,
      "discord-discord:guild-123:channel-123:thread-456",
      false,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
    expect(suite.agentService.confirmPendingAction).toHaveBeenNthCalledWith(
      2,
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-2",
      expectDiscordConfirmationContext(),
    );
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Declined\n\nRemaining pending approval ids: `approval-2`.",
        card: expect.objectContaining({ title: "Approval declined" }),
      }),
    );
  });

  it("selects the exact colon approval id when ids share a prefix", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval:call-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval:call-10",
          toolName: "system_publish",
          summary: "Publish ten",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval:call-10", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval:call-10",
      expectDiscordConfirmationContext(),
    );
  });

  it("selects the exact approval id when ids share a prefix", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Please confirm.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      pendingConfirmations: [
        {
          id: "approval-1",
          toolName: "system_publish",
          summary: "Publish one",
          args: {},
        },
        {
          id: "approval-10",
          toolName: "system_publish",
          summary: "Publish ten",
          args: {},
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "yes approval-10", isMention: false }),
    );

    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      "discord-discord:guild-123:channel-123:thread-456",
      true,
      "approval-10",
      expectDiscordConfirmationContext(),
    );
  });

  it("restores pending approvals from stored conversation metadata", async () => {
    const conversationId = "discord-discord:guild-123:channel-123:thread-456";
    suite.harness.getMockShell().getConversationService = (): never =>
      ({
        startConversation: mock(() => Promise.resolve(conversationId)),
        addMessage: mock(() => Promise.resolve()),
        getConversation: mock(() => Promise.resolve(null)),
        listConversations: mock(() => Promise.resolve([])),
        searchConversations: mock(() => Promise.resolve([])),
        getMessages: mock(() =>
          Promise.resolve([
            {
              id: "assistant-message-1",
              conversationId,
              role: "assistant",
              content: "Please confirm.",
              timestamp: new Date().toISOString(),
              metadata: JSON.stringify({
                cards: [
                  {
                    kind: "tool-approval",
                    id: "approval-1",
                    toolName: "system_publish",
                    summary: "Publish restored post",
                    state: "approval-requested",
                  },
                ],
              }),
            },
          ]),
        ),
        countMessages: mock(() => Promise.resolve(1)),
        updateConversationMetadata: mock(() => Promise.resolve(false)),
        deleteConversation: mock(() => Promise.resolve(false)),
        close: mock(() => {}),
      }) as never;
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({ text: "yes approval-1" }),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(suite.agentService.confirmPendingAction).toHaveBeenCalledWith(
      conversationId,
      true,
      "approval-1",
      expectDiscordConfirmationContext(),
    );
  });
});
