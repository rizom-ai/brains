import { describe, it, expect, mock } from "bun:test";
import { PermissionService, createPluginHarness } from "@brains/plugins/test";
import { PromptActionStore } from "../src/prompt-action-store";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createMessage,
  createPlugin,
  createThread,
  discordExternalIdentity,
  findPostedCard,
  getCardActionButtons,
  getFirstPromptActionToken,
  getPromptActionTokens,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";
import type { ChatInterfaceInstance } from "./harness/chat-interface-harness";

describe("ChatInterface cards and suggested actions", () => {
  const suite = setupChatInterfaceTest();

  it("renders event actions as unavailable disabled Discord buttons", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Choose an action.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "actions",
          id: "actions-events",
          title: "Mixed actions",
          actions: [
            {
              type: "event",
              id: "event-1",
              label: "Open picker",
              event: "picker.open",
              description: "Requires web chat UI",
            },
            {
              type: "prompt",
              id: "action-1",
              label: "Draft announcement",
              prompt: "Draft an announcement",
            },
          ],
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Actions: Mixed actions\n- Open picker (not available in Discord)\n- Draft announcement",
        card: expect.objectContaining({
          title: "Mixed actions",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              content:
                "Open picker — Requires web chat UI (not available in Discord)",
            }),
            expect.objectContaining({
              type: "actions",
              children: [
                expect.objectContaining({
                  type: "button",
                  id: "chat.event.unavailable",
                  label: "Open picker",
                  value: "picker.open",
                  disabled: true,
                }),
                expect.objectContaining({
                  type: "button",
                  id: "chat.prompt",
                  label: "Draft announcement",
                  value: expect.stringMatching(/^action_/),
                }),
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("posts source and action cards as supplemental SDK cards", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Here are the next steps.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "sources",
          id: "sources-1",
          title: "References",
          sources: [
            {
              id: "source-1",
              title: "Launch Plan",
              source: "document",
              url: "https://example.com/launch",
            },
            {
              id: "source-2",
              title: "Local Draft",
              source: "document",
              url: "http://localhost:3000/documents/local-draft",
            },
          ],
        },
        {
          kind: "actions",
          id: "actions-1",
          title: "Next actions",
          actions: [
            {
              type: "prompt",
              id: "action-1",
              label: "Draft announcement",
              prompt: "Draft an announcement",
              description: "Prepare launch copy",
            },
          ],
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith("Here are the next steps.");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Sources: References\n- Launch Plan — https://example.com/launch\n- Local Draft",
        card: expect.objectContaining({
          title: "References",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: [
                expect.objectContaining({
                  type: "link-button",
                  label: "Open 1",
                  url: "https://example.com/launch",
                }),
              ],
            }),
          ]),
        }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls)).not.toContain("localhost");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Actions: Next actions\n- Draft announcement",
        card: expect.objectContaining({
          title: "Next actions",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: [
                expect.objectContaining({
                  type: "button",
                  id: "chat.prompt",
                  label: "Draft announcement",
                  value: expect.stringMatching(/^action_/),
                }),
              ],
            }),
          ]),
        }),
      }),
    );
  });

  it("posts and routes native Slack suggested-action cards", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "slack:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "I got a-campus-that-remembers.pdf.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "slack-actions-1",
            title: "Try next",
            actions: [
              {
                type: "prompt",
                id: "summarize-pdf",
                label: "Summarize PDF",
                prompt: "Summarize the PDF",
              },
              {
                type: "prompt",
                id: "save-document",
                label: "Save document",
                prompt: "Save the document",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Here is the summary.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    const pdf = Buffer.from("%PDF-1.7 suggested action");
    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Use a-campus-that-remembers.pdf",
        attachments: [
          {
            name: "a-campus-that-remembers.pdf",
            mimeType: "application/pdf",
            size: pdf.byteLength,
            fetchData: mock(() => Promise.resolve(pdf)),
          },
        ],
      }),
    );

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Actions: Try next\n- Summarize PDF\n- Save document",
        card: expect.objectContaining({
          title: "Try next",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  id: expect.stringMatching(/^chat\.prompt:action_/),
                  label: "Summarize PDF",
                  value: expect.stringMatching(/^action_/),
                }),
                expect.objectContaining({
                  id: expect.stringMatching(/^chat\.prompt:action_/),
                  label: "Save document",
                  value: expect.stringMatching(/^action_/),
                }),
              ]),
            }),
          ]),
        }),
      }),
    );

    const actionToken = getFirstPromptActionToken(thread);
    const actionButtons = getCardActionButtons(thread, "Try next");
    expect(actionButtons[0]?.id).not.toBe(actionButtons[1]?.id);
    const actionCard = findPostedCard(thread, "Try next");
    expect(
      actionCard?.children.filter((child) => child.type === "text"),
    ).toEqual([]);
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => Array.isArray(actionIds) && actionIds.length === 0,
    )?.handler;
    await promptActionHandler?.({
      actionId: actionButtons[0]?.id ?? "",
      adapter: { name: "slack" },
      messageId: "slack-actions-message-1",
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
      value: actionToken,
    });

    expect(suite.agentService.chat).toHaveBeenNthCalledWith(
      2,
      "Summarize the PDF",
      `slack-${thread.id}`,
      expect.objectContaining({
        interfaceType: "slack",
        channelId: thread.id,
        userPermissionLevel: "trusted",
        attachments: [
          expect.objectContaining({
            kind: "file",
            filename: "a-campus-that-remembers.pdf",
            data: pdf,
            source: expect.objectContaining({ kind: "upload" }),
          }),
        ],
      }),
    );
    const source =
      suite.agentService.chat.mock.calls[1]?.[2]?.attachments?.[0]?.source;
    expect(source?.kind).toBe("upload");
    if (!source) throw new Error("Expected canonical upload source");
    const stored = await suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped({
        namespace: "upload",
        refKind: "upload",
        routePath: "/api/chat/uploads",
      })
      .read(source.id);
    expect(stored.content).toEqual(pdf);
  });

  it("does not restore uploads for public Slack suggested actions", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [
          { pattern: "slack:user-789", level: "trusted" },
          { pattern: "slack:*", level: "public" },
        ],
      }),
    );
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "I got private.png.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "private-image-actions",
            title: "Try next",
            actions: [
              {
                type: "prompt",
                id: "describe-image",
                label: "Describe image",
                prompt: "Describe the image",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "No private attachment available.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Use private.png",
        attachments: [
          {
            name: "private.png",
            mimeType: "image/png",
            size: image.byteLength,
            fetchData: mock(() => Promise.resolve(image)),
          },
        ],
      }),
    );

    const actionToken = getFirstPromptActionToken(thread);
    const actionButton = getCardActionButtons(thread, "Try next")[0];
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => Array.isArray(actionIds) && actionIds.length === 0,
    )?.handler;
    await promptActionHandler?.({
      actionId: actionButton?.id ?? "",
      adapter: { name: "slack" },
      messageId: "private-image-actions-message",
      openModal: mock(() => Promise.resolve(undefined)),
      raw: {},
      thread,
      threadId: thread.id,
      user: {
        userId: "public-user",
        userName: "guest",
        fullName: "Guest User",
        isBot: false,
        isMe: false,
      },
      value: actionToken,
    });

    expect(suite.agentService.chat.mock.calls[1]?.[2]).toEqual(
      expect.objectContaining({
        userPermissionLevel: "public",
      }),
    );
    expect(
      suite.agentService.chat.mock.calls[1]?.[2]?.attachments,
    ).toBeUndefined();
  });

  it("caps Discord source and action card buttons to component limits", async () => {
    const longLabel = `Draft ${"launch ".repeat(20)}`;
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Many options.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "sources",
          id: "sources-many",
          title: "Many references",
          sources: Array.from({ length: 30 }, (_, index) => ({
            id: `source-${index + 1}`,
            title: `Source ${index + 1}`,
            source: "document",
            url: `https://example.com/source-${index + 1}`,
          })),
        },
        {
          kind: "actions",
          id: "actions-many",
          title: "Many actions",
          actions: Array.from({ length: 30 }, (_, index) => ({
            type: "prompt" as const,
            id: `action-${index + 1}`,
            label: index === 0 ? longLabel : `Action ${index + 1}`,
            prompt: `Run action ${index + 1}`,
          })),
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    const sourceButtons = getCardActionButtons(thread, "Many references");
    expect(sourceButtons).toHaveLength(25);
    expect(sourceButtons.at(-1)).toEqual(
      expect.objectContaining({
        type: "link-button",
        label: "Open 25",
        url: "https://example.com/source-25",
      }),
    );
    const actionButtons = getCardActionButtons(thread, "Many actions");
    expect(actionButtons).toHaveLength(25);
    expect(getPromptActionTokens(thread)).toHaveLength(25);
    expect(actionButtons[0]?.label).toHaveLength(80);
    expect(actionButtons[0]?.label?.endsWith("…")).toBe(true);
    expect(actionButtons.at(-1)).toEqual(
      expect.objectContaining({
        type: "button",
        id: "chat.prompt",
        label: "Action 25",
      }),
    );
  });

  it("reports stale suggested prompt action tokens after restart", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Pick one.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "actions",
          id: "actions-1",
          title: "Next actions",
          actions: [
            {
              type: "prompt",
              id: "action-1",
              label: "Draft announcement",
              prompt: "Draft an announcement",
            },
          ],
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const staleToken = getFirstPromptActionToken(thread);

    await suite.harness.reset();
    MockChatSdk.instances = [];
    suite.harness = createPluginHarness<ChatInterfaceInstance>();
    suite.harness.setAgentService(suite.agentService);
    await suite.harness.installPlugin(createPlugin());
    const restartedChat = MockChatSdk.instances[0];
    const promptActionHandler = restartedChat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "actions-message-1",
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
      value: staleToken,
    });

    expect(suite.agentService.chat).toHaveBeenCalledTimes(1);
    expect(thread.post.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        fallbackText: "That suggested action is no longer available.",
        card: expect.objectContaining({ title: "Action unavailable" }),
      }),
    );
  });

  it("keeps reused suggested prompt action ids routed to their original prompts", async () => {
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "First card.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "First actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft first",
                prompt: "Draft first announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Second card.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-2",
            title: "Second actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft second",
                prompt: "Draft second announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Drafted first.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const firstToken = getFirstPromptActionToken(thread);
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "more options", isMention: false }),
    );
    const tokens = getPromptActionTokens(thread);
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toBe(firstToken);
    expect(tokens[1]).toMatch(/^action_/);
    expect(tokens[1]).not.toBe(firstToken);

    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "first-actions-message",
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
      value: firstToken,
    });

    expect(suite.agentService.chat).toHaveBeenNthCalledWith(
      3,
      "Draft first announcement",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({ interfaceType: "discord" }),
    );
  });

  it("routes suggested prompt action buttons to the agent", async () => {
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "Pick one.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "Next actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft announcement",
                prompt: "Draft an announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Drafted announcement.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const actionToken = getFirstPromptActionToken(thread);
    expect(actionToken).toMatch(/^action_/);
    expect(actionToken).not.toBe("action-1");
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "actions-message-1",
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
      value: actionToken,
    });

    expect(suite.agentService.chat).toHaveBeenNthCalledWith(
      2,
      "Draft an announcement",
      "discord-discord:guild-123:channel-123:thread-456",
      expect.objectContaining({
        interfaceType: "discord",
        channelId: "discord:guild-123:channel-123:thread-456",
        actor: expect.objectContaining({
          identity: discordExternalIdentity,
          displayName: "Mira Ops",
          username: "mira",
        }),
        source: expect.objectContaining({
          messageId: "actions-message-1",
          channelId: "discord:guild-123:channel-123:thread-456",
          threadId: "thread-456",
          metadata: expect.objectContaining({
            actionId: "chat.prompt",
            actionValue: actionToken,
            guildId: "guild-123",
          }),
        }),
      }),
    );
    expect(thread.startTyping).toHaveBeenCalledTimes(2);
    expect(thread.post).toHaveBeenLastCalledWith("Drafted announcement.");
  });

  it("consumes a suggested prompt action token so it cannot be replayed", async () => {
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "Pick one.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "Next actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft announcement",
                prompt: "Draft an announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Drafted announcement.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const actionToken = getFirstPromptActionToken(thread);
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;

    const event = {
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "actions-message-1",
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
      value: actionToken,
    };

    await promptActionHandler?.(event);
    expect(suite.agentService.chat).toHaveBeenCalledTimes(2);

    // Replaying the same token must not fire another agent turn
    await promptActionHandler?.(event);
    expect(suite.agentService.chat).toHaveBeenCalledTimes(2);
    expect(thread.post.mock.calls.at(-1)?.[0]).toEqual(
      expect.objectContaining({
        fallbackText: "That suggested action is no longer available.",
        card: expect.objectContaining({ title: "Action unavailable" }),
      }),
    );
  });

  it("bounds the number of retained never-clicked prompt action tokens", () => {
    const store = new PromptActionStore(1000);

    const firstToken = store.register("discord:thread", {
      label: "Action 0",
      prompt: "Prompt 0",
    });
    for (let i = 1; i < 2000; i++) {
      store.register("discord:thread", {
        label: `Action ${i}`,
        prompt: `Prompt ${i}`,
      });
    }

    expect(store.size).toBeLessThanOrEqual(1000);
    // Oldest never-clicked tokens are the ones evicted
    expect(store.get(firstToken)).toBeUndefined();
  });

  it("does not route suggested prompt actions when Discord DMs are disabled", async () => {
    suite.agentService.chat
      .mockResolvedValueOnce({
        text: "Pick one.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        cards: [
          {
            kind: "actions",
            id: "actions-1",
            title: "Next actions",
            actions: [
              {
                type: "prompt",
                id: "action-1",
                label: "Draft announcement",
                prompt: "Draft an announcement",
              },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        text: "Should not run.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin({ allowDMs: false });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    const actionToken = getFirstPromptActionToken(thread);
    thread.isDM = true;
    const promptActionHandler = chat?.handlers.actions.find(
      ({ actionIds }) => actionIds === "chat.prompt",
    )?.handler;
    await promptActionHandler?.({
      actionId: "chat.prompt",
      adapter: { name: "discord" },
      messageId: "actions-message-1",
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
      value: actionToken,
    });

    expect(suite.agentService.chat).toHaveBeenCalledTimes(1);
  });

  it("formats structured approval cards without raw JSON", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Approval needed.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "tool-approval",
          id: "approval-card-1",
          toolName: "system_publish",
          summary: "Publish Launch Post",
          preview: "This will publish the draft post.",
          state: "approval-requested",
          input: { entityId: "post-1" },
        },
        {
          kind: "tool-approval",
          id: "approval-card-2",
          toolName: "system_publish",
          summary: "Publish Follow-up",
          state: "output-available",
          output: { ok: true, internal: "not for discord" },
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith("Approval needed.");
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Approval: Publish Launch Post\nStatus: approval-requested\nThis will publish the draft post.",
        card: expect.objectContaining({ title: "Approval required" }),
      }),
    );
    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Approval: Publish Follow-up\nStatus: output-available",
        card: expect.objectContaining({ title: "Approval status" }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls)).not.toContain("internal");
  });
});
