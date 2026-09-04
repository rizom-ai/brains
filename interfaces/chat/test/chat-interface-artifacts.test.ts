import { describe, it, expect, mock } from "bun:test";
import { PermissionService, createPluginHarness } from "@brains/plugins/test";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createMessage,
  createPlugin,
  createSentMessage,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";
import type {
  ChatInterfaceInstance,
  MockPostMessage,
} from "./harness/chat-interface-harness";

describe("ChatInterface artifacts", () => {
  const suite = setupChatInterfaceTest();

  it("sends an error message when agent chat fails", async () => {
    suite.agentService.chat.mockRejectedValueOnce(new Error("Agent failed"));
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Message failed: Agent failed",
        card: expect.objectContaining({ title: "Message failed" }),
      }),
    );
  });

  it("posts structured artifact cards as SDK cards with concise fallback text", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Deck carousel",
          description: "Ready to review.",
          attachment: {
            mediaType: "application/pdf",
            url: "https://brain.test/api/chat/attachments/document?id=deck-1",
            downloadUrl:
              "https://brain.test/api/chat/attachments/document?id=deck-1&download=1",
            previewUrl:
              "https://brain.test/api/chat/attachments/document?id=deck-1&preview=1",
            filename: "deck-carousel.pdf",
            sizeBytes: 1234,
          },
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated the deck.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Artifact: Deck carousel\nReady to review.\nFile: deck-carousel.pdf\nType: application/pdf\nSize: 1.2 KB",
        card: expect.objectContaining({
          type: "card",
          title: "Deck carousel",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "text",
              content: "Ready to review.",
            }),
            expect.objectContaining({
              type: "fields",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "field",
                  label: "File",
                  value: "deck-carousel.pdf",
                }),
                expect.objectContaining({
                  type: "field",
                  label: "Type",
                  value: "application/pdf",
                }),
                expect.objectContaining({
                  type: "field",
                  label: "Size",
                  value: "1.2 KB",
                }),
              ]),
            }),
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "link-button",
                  label: "Open",
                  url: "https://brain.test/api/chat/attachments/document?id=deck-1",
                }),
                expect.objectContaining({
                  type: "link-button",
                  label: "Download",
                  url: "https://brain.test/api/chat/attachments/document?id=deck-1&download=1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("posts native Slack files for trusted generated artifacts", async () => {
    suite.harness.addEntities([
      {
        id: "deck-slack-native",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 slack").toString("base64")}`,
        metadata: { filename: "deck-carousel.pdf" },
        visibility: "shared",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "slack:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Deck carousel",
          description: "Ready to review.",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-slack-native",
            filename: "deck-carousel.pdf",
            sizeBytes: 1234,
            source: {
              entityType: "document",
              entityId: "deck-slack-native",
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

    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        markdown: "Generated the deck.",
        files: [
          expect.objectContaining({
            filename: "deck-carousel.pdf",
            mimeType: "application/pdf",
          }),
        ],
      }),
    );
    expect(thread.post).toHaveBeenCalledTimes(1);
  });

  it("posts native Discord files for trusted generated document artifacts", async () => {
    suite.harness.addEntities([
      {
        id: "deck-native",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "native-deck.pdf" },
        visibility: "shared",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Native deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-native",
            filename: "native-deck.pdf",
            source: { entityType: "document", entityId: "deck-native" },
          },
        },
      ],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        markdown: "Generated the deck.",
        files: [
          expect.objectContaining({
            filename: "native-deck.pdf",
            mimeType: "application/pdf",
          }),
        ],
      }),
    );
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Artifact: Native deck\nFile: native-deck.pdf\nType: application/pdf",
        card: expect.objectContaining({
          type: "card",
          title: "Native deck",
        }),
      }),
    );
  });

  it("posts native Discord image files resolved from artifact URLs", async () => {
    suite.harness.addEntities([
      {
        id: "image-native",
        entityType: "image",
        content: `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`,
        metadata: { filename: "native-image.png" },
        visibility: "shared",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the image.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Native image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=image-native",
            filename: "native-image.png",
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          expect.objectContaining({
            filename: "native-image.png",
            mimeType: "image/png",
          }),
        ],
      }),
    );
  });

  it("does not post restricted native Discord artifact files for trusted users", async () => {
    suite.harness.addEntities([
      {
        id: "deck-trusted-denied",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "trusted-denied-deck.pdf" },
        visibility: "restricted",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Trusted denied deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-trusted-denied",
            filename: "trusted-denied-deck.pdf",
            source: {
              entityType: "document",
              entityId: "deck-trusted-denied",
            },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "Artifact: Not available at your access level.",
      ].join("\n\n"),
    );
  });

  it("does not render relative-only artifact links when the referenced entity does not exist", async () => {
    // A card whose entity is not stored must not be mistaken for an
    // out-of-scope artifact: its link still renders rather than being
    // suppressed as denied.
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Missing deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-missing",
            filename: "missing-deck.pdf",
            source: { entityType: "document", entityId: "deck-missing" },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated the deck.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText:
          "Artifact: Missing deck\nFile: missing-deck.pdf\nType: application/pdf",
        card: expect.objectContaining({
          type: "card",
          title: "Missing deck",
          children: expect.not.arrayContaining([
            expect.objectContaining({ type: "actions" }),
          ]),
        }),
      }),
    );
  });

  it("does not post native Discord artifact files for public users", async () => {
    suite.harness.addEntities([
      {
        id: "deck-public-denied",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "denied-deck.pdf" },
        visibility: "restricted",
      },
    ]);
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Denied deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-public-denied",
            filename: "denied-deck.pdf",
            source: {
              entityType: "document",
              entityId: "deck-public-denied",
            },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "Artifact: Not available at your access level.",
      ].join("\n\n"),
    );
  });

  it("suppresses shared artifact fallback links for public Discord users", async () => {
    suite.harness.addEntities([
      {
        id: "deck-public-shared-denied",
        entityType: "document",
        content: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
        metadata: { filename: "shared-denied-deck.pdf" },
        visibility: "shared",
      },
    ]);
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the deck.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Shared denied deck",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-public-shared-denied",
            downloadUrl:
              "/api/chat/attachments/document?id=deck-public-shared-denied&download=1",
            filename: "shared-denied-deck.pdf",
            source: {
              entityType: "document",
              entityId: "deck-public-shared-denied",
            },
          },
        },
      ],
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      [
        "Generated the deck.",
        "Artifact: Not available at your access level.",
      ].join("\n\n"),
    );
  });

  it("formats relative structured artifact links as absolute Discord-readable URLs", async () => {
    await suite.harness.reset();
    suite.harness = createPluginHarness<ChatInterfaceInstance>({
      domain: "brain.test",
    });
    suite.harness.setAgentService(suite.agentService);
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated the image.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Robot image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=robot-1",
            downloadUrl: "/api/chat/attachments/image?id=robot-1&download=1",
            previewUrl: "/api/chat/attachments/image?id=robot-1&preview=1",
            filename: "robot.png",
          },
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated the image.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText: "Artifact: Robot image\nFile: robot.png\nType: image/png",
        card: expect.objectContaining({
          type: "card",
          title: "Robot image",
          children: expect.arrayContaining([
            expect.objectContaining({
              type: "actions",
              children: expect.arrayContaining([
                expect.objectContaining({
                  type: "link-button",
                  label: "Preview",
                  url: "https://brain.test/api/chat/attachments/image?id=robot-1&preview=1",
                }),
                expect.objectContaining({
                  type: "link-button",
                  label: "Open",
                  url: "https://brain.test/api/chat/attachments/image?id=robot-1",
                }),
                expect.objectContaining({
                  type: "link-button",
                  label: "Download",
                  url: "https://brain.test/api/chat/attachments/image?id=robot-1&download=1",
                }),
              ]),
            }),
          ]),
        }),
      }),
    );
  });

  it("does not expose localhost artifact links in Discord summaries", async () => {
    await suite.harness.reset();
    suite.harness = createPluginHarness<ChatInterfaceInstance>({
      domain: "brain.test",
      localSiteUrl: "http://localhost:4321",
      preferLocalUrls: true,
    });
    suite.harness.setAgentService(suite.agentService);
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Generated local preview.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          title: "Local robot",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=robot-local",
            filename: "robot.png",
          },
        },
      ],
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenNthCalledWith(1, "Generated local preview.");
    expect(thread.post).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        fallbackText: "Artifact: Local robot\nFile: robot.png\nType: image/png",
        card: expect.objectContaining({
          type: "card",
          title: "Local robot",
          children: expect.not.arrayContaining([
            expect.objectContaining({ type: "actions" }),
          ]),
        }),
      }),
    );
    expect(JSON.stringify(thread.post.mock.calls)).not.toContain("localhost");
  });
});
