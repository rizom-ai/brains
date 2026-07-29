import { describe, it, expect, mock } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import {
  createCanonicalChatUploadStoreScope,
  createDiscordChatUploadStoreScope,
} from "../src/upload-store";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createFetchStub,
  createMessage,
  createPlugin,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";

describe("ChatInterface uploads", () => {
  const suite = setupChatInterfaceTest();

  it("fetches trusted Slack files through the adapter and stores them durably", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "slack:*", level: "trusted" }],
      }),
    );
    const fetchData = mock(() => Promise.resolve(Buffer.from("secret")));
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Read this later",
        attachments: [
          {
            name: "secret.txt",
            mimeType: "text/plain",
            size: 6,
            fetchData,
          },
        ],
      }),
    );

    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat.mock.calls[0]?.[2]).toMatchObject({
      userPermissionLevel: "trusted",
      interfaceType: "slack",
      attachments: [
        expect.objectContaining({
          kind: "text",
          filename: "secret.txt",
          content: "secret",
          source: expect.objectContaining({ kind: "upload" }),
        }),
      ],
    });

    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "Use secret.txt again",
        threadId: thread.id,
        isMention: false,
      }),
    );
    expect(suite.agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        filename: "secret.txt",
        source: expect.objectContaining({ kind: "upload" }),
      }),
    ]);
  });

  it("does not fetch Slack files for public users", async () => {
    const fetchData = mock(() => Promise.resolve(Buffer.from("secret")));
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Read this",
        attachments: [
          {
            name: "secret.txt",
            mimeType: "text/plain",
            size: 6,
            fetchData,
          },
        ],
      }),
    );

    expect(fetchData).not.toHaveBeenCalled();
    expect(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
    ).toBeUndefined();
  });

  it("passes trusted text file uploads as durable native attachments", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const fetchData = mock(() => Promise.resolve(Buffer.from("file body")));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Read this",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            size: 9,
            fetchData,
          },
        ],
      }),
    );

    expect(fetchData).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Read this");
    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "text",
        filename: "notes.txt",
        mediaType: "text/plain",
        content: "file body",
        sizeBytes: 9,
        source: {
          kind: "upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
    ]);
    const source =
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments?.[0]?.source;
    const uploadStore = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createCanonicalChatUploadStoreScope());
    const record = await uploadStore.readRecord(source?.id ?? "");
    expect(record.metadata).toEqual({
      interfaceType: "discord",
      channelId: "discord:guild-123:channel-123:thread-456",
      parentChannelId: "discord:guild-123:channel-123",
      messageId: "message-123",
      uploaderId: "user-789",
      uploaderUsername: "mira",
      guildId: "guild-123",
      threadId: "thread-456",
    });
  });

  it("does not download text uploads for public users", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const fetchData = mock(() => Promise.resolve(Buffer.from("file body")));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Read this",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            size: 9,
            fetchData,
          },
        ],
      }),
    );

    expect(fetchData).not.toHaveBeenCalled();
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Read this");
  });

  it("does not download binary uploads for public users", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const imageFetchData = mock(() => Promise.resolve(Buffer.from("image")));
    const pdfFetchData = mock(() => Promise.resolve(Buffer.from("pdf")));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Use these",
        attachments: [
          {
            name: "diagram.png",
            mimeType: "image/png",
            size: 5,
            fetchData: imageFetchData,
          },
          {
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: 3,
            fetchData: pdfFetchData,
          },
        ],
      }),
    );

    expect(imageFetchData).not.toHaveBeenCalled();
    expect(pdfFetchData).not.toHaveBeenCalled();
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Use these");
    expect(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
    ).toBeUndefined();
  });

  it("passes trusted Slack image and PDF uploads as native attachments", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "slack:*", level: "trusted" }],
      }),
    );
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const pdf = Buffer.from("%PDF-1.7");

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Use these",
        attachments: [
          {
            name: "diagram.png",
            mimeType: "image/png",
            size: image.byteLength,
            fetchData: mock(() => Promise.resolve(image)),
          },
          {
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: pdf.byteLength,
            fetchData: mock(() => Promise.resolve(pdf)),
          },
        ],
      }),
    );

    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "diagram.png",
        data: image,
        source: expect.objectContaining({ kind: "upload" }),
      }),
      expect.objectContaining({
        kind: "file",
        filename: "brief.pdf",
        data: pdf,
        source: expect.objectContaining({ kind: "upload" }),
      }),
    ]);
  });

  it("passes trusted image and PDF uploads as durable native file attachments", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const pdf = Buffer.from("%PDF-1.7");
    const imageFetchData = mock(() => Promise.resolve(image));
    const pdfFetchData = mock(() => Promise.resolve(pdf));

    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Use these",
        attachments: [
          {
            name: "diagram.png",
            mimeType: "image/png",
            size: image.byteLength,
            fetchData: imageFetchData,
          },
          {
            name: "brief.pdf",
            mimeType: "application/pdf",
            size: pdf.byteLength,
            fetchData: pdfFetchData,
          },
        ],
      }),
    );

    expect(imageFetchData).toHaveBeenCalledTimes(1);
    expect(pdfFetchData).toHaveBeenCalledTimes(1);
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Use these");
    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "file",
        filename: "diagram.png",
        mediaType: "image/png",
        data: image,
        sizeBytes: image.byteLength,
        source: {
          kind: "upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
      {
        kind: "file",
        filename: "brief.pdf",
        mediaType: "application/pdf",
        data: pdf,
        sizeBytes: pdf.byteLength,
        source: {
          kind: "upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
    ]);
  });

  it("downloads trusted Discord gateway attachments from URL-only metadata", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const pdf = Buffer.from("%PDF-1.7 live attachment");
    const originalFetch = globalThis.fetch;
    const fetchMock = mock((_url: string) =>
      Promise.resolve(new Response(pdf, { status: 200 })),
    );
    globalThis.fetch = createFetchStub(originalFetch, (input) =>
      fetchMock(String(input)),
    );

    try {
      await chat?.handlers.mentions[0]?.(
        createThread(),
        createMessage({
          text: "Can you summarize this PDF?",
          attachments: [
            {
              name: "distributed-systems-primer.pdf",
              mimeType: "application/pdf",
              size: pdf.byteLength,
              url: "https://cdn.discordapp.com/attachments/file.pdf",
            },
          ],
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(fetchMock).toHaveBeenCalledWith(
      "https://cdn.discordapp.com/attachments/file.pdf",
    );
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe(
      "Can you summarize this PDF?",
    );
    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "file",
        filename: "distributed-systems-primer.pdf",
        mediaType: "application/pdf",
        data: pdf,
        sizeBytes: pdf.byteLength,
        source: {
          kind: "upload",
          id: expect.stringMatching(/^upload-/),
        },
      },
    ]);
  });

  it("reports unsupported, oversized, and spoofed uploads", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const unsupportedFetchData = mock(() =>
      Promise.resolve(Buffer.from("binary")),
    );
    const oversizedFetchData = mock(() =>
      Promise.resolve(Buffer.from("large")),
    );
    const spoofedFetchData = mock(() =>
      Promise.resolve(Buffer.from([0x00, 0x01, 0x02])),
    );

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Read these",
        attachments: [
          {
            name: "archive.bin",
            mimeType: "application/octet-stream",
            size: 10,
            fetchData: unsupportedFetchData,
          },
          {
            name: "huge.txt",
            mimeType: "text/plain",
            size: 1024 * 1024 + 1,
            fetchData: oversizedFetchData,
          },
          {
            name: "fake-notes.txt",
            mimeType: "text/plain",
            size: 3,
            fetchData: spoofedFetchData,
          },
        ],
      }),
    );

    expect(unsupportedFetchData).not.toHaveBeenCalled();
    expect(oversizedFetchData).not.toHaveBeenCalled();
    expect(spoofedFetchData).toHaveBeenCalledTimes(1);
    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      [
        "Some uploads were skipped:",
        "- Unsupported file upload type: archive.bin",
        "- File upload too large: huge.txt",
        "- Unsupported file upload type: fake-notes.txt",
      ].join("\n"),
    );
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Read these");
    expect(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
    ).toBeUndefined();
  });

  it("reports skipped uploads without calling the agent when no usable input remains", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "",
        attachments: [
          {
            name: "archive.bin",
            mimeType: "application/octet-stream",
            size: 10,
            fetchData: mock(() => Promise.resolve(Buffer.from("binary"))),
          },
        ],
      }),
    );

    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(
      "Some uploads were skipped:\n- Unsupported file upload type: archive.bin",
    );
  });

  it("reuses trusted uploads on follow-up requests after agent chat fails", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat
      .mockRejectedValueOnce(new Error("model unavailable"))
      .mockResolvedValueOnce({
        text: "Described upload.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "remember this image",
        attachments: [
          {
            name: "failed-turn-robot.png",
            mimeType: "image/png",
            size: image.byteLength,
            fetchData: mock(() => Promise.resolve(image)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe that image",
        isMention: false,
      }),
    );

    expect(suite.agentService.chat).toHaveBeenCalledTimes(2);
    expect(suite.agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "failed-turn-robot.png",
        mediaType: "image/png",
        data: image,
      }),
    ]);
  });

  it("passes recent trusted uploads as follow-up candidates without message-text selection", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const firstImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
    const secondImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "store this",
        attachments: [
          {
            name: "first-robot.png",
            mimeType: "image/png",
            size: firstImage.byteLength,
            fetchData: mock(() => Promise.resolve(firstImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "store this too",
        isMention: false,
        attachments: [
          {
            name: "second-robot.png",
            mimeType: "image/png",
            size: secondImage.byteLength,
            fetchData: mock(() => Promise.resolve(secondImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe the most recent image",
        isMention: false,
      }),
    );

    expect(suite.agentService.chat.mock.calls[2]?.[0]).toBe(
      "describe the most recent image",
    );
    expect(suite.agentService.chat.mock.calls[2]?.[2]?.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file",
          filename: "first-robot.png",
          mediaType: "image/png",
          data: firstImage,
        }),
        expect.objectContaining({
          kind: "file",
          filename: "second-robot.png",
          mediaType: "image/png",
          data: secondImage,
        }),
      ]),
    );
  });

  it("keeps prior trusted upload candidates even when the follow-up says first", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const firstImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
    const secondImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "store first",
        attachments: [
          {
            name: "first-robot.png",
            mimeType: "image/png",
            size: firstImage.byteLength,
            fetchData: mock(() => Promise.resolve(firstImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "store second",
        isMention: false,
        attachments: [
          {
            name: "second-robot.png",
            mimeType: "image/png",
            size: secondImage.byteLength,
            fetchData: mock(() => Promise.resolve(secondImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe the first image",
        isMention: false,
      }),
    );

    expect(suite.agentService.chat.mock.calls[2]?.[2]?.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file",
          filename: "first-robot.png",
          mediaType: "image/png",
          data: firstImage,
        }),
        expect.objectContaining({
          kind: "file",
          filename: "second-robot.png",
          mediaType: "image/png",
          data: secondImage,
        }),
      ]),
    );
  });

  it("passes prior trusted uploads by filename as model-visible candidates", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const firstImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
    const secondImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 2]);

    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "store these",
        attachments: [
          {
            name: "first-robot.png",
            mimeType: "image/png",
            size: firstImage.byteLength,
            fetchData: mock(() => Promise.resolve(firstImage)),
          },
          {
            name: "second-robot.png",
            mimeType: "image/png",
            size: secondImage.byteLength,
            fetchData: mock(() => Promise.resolve(secondImage)),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "describe first-robot.png",
        isMention: false,
      }),
    );

    expect(suite.agentService.chat.mock.calls[1]?.[0]).toBe(
      "describe first-robot.png",
    );
    expect(suite.agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "file",
          filename: "first-robot.png",
          mediaType: "image/png",
          data: firstImage,
        }),
        expect.objectContaining({
          kind: "file",
          filename: "second-robot.png",
          mediaType: "image/png",
          data: secondImage,
        }),
      ]),
    );
  });

  it("restores prior uploads from stored conversation metadata after restart", async () => {
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "discord:*", level: "trusted" }],
      }),
    );
    const image = Buffer.from([7, 8, 9]);
    const uploadStore = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createDiscordChatUploadStoreScope());
    const record = await uploadStore.save({
      filename: "stored-robot.png",
      mediaType: "image/png",
      content: image,
    });
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
              id: "stored-message-1",
              conversationId,
              role: "user",
              content: "uploaded image",
              timestamp: new Date().toISOString(),
              metadata: JSON.stringify({
                attachments: [
                  {
                    kind: "file",
                    filename: record.filename,
                    mediaType: record.mediaType,
                    sizeBytes: record.sizeBytes,
                    source: record.ref,
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
      createMessage({ text: "describe stored-robot.png" }),
    );

    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe(
      "describe stored-robot.png",
    );
    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      expect.objectContaining({
        kind: "file",
        filename: "stored-robot.png",
        mediaType: "image/png",
        data: image,
        source: expect.objectContaining({ kind: "upload" }),
      }),
    ]);
  });
});
