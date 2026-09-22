import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import {
  RetainedUploadBatchError,
  type IConversationService,
} from "@brains/plugins";
import assert from "node:assert/strict";
import { createCanonicalChatUploadStoreScope } from "../src/upload-store";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createMessage,
  createPlugin,
  createThread,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";
import {
  installUploadFileFixture,
  type UploadFileFixture,
} from "./harness/upload-file-fixture";

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1]);
const pdf = Buffer.from("%PDF-1.7 fixture");
const forbiddenDownload = (): never => {
  throw new Error("Controller SDK download forbidden");
};

describe("ChatInterface scoped uploads", () => {
  const suite = setupChatInterfaceTest();
  let files: UploadFileFixture;
  beforeEach(() => {
    files = installUploadFileFixture(
      suite.harness.getMockShell().getEntityService(),
    );
  });
  afterEach(async () => {
    await files.close();
  });
  const trust = (platform: string): void =>
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: `${platform}:*`, level: "trusted" }],
      }),
    );
  const slackThread = (): ReturnType<typeof createThread> =>
    createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
    });

  it("captures trusted Slack text with authorization and restores refs without SDK bytes", async () => {
    trust("slack");
    const fetchData = mock(forbiddenDownload);
    const controllerFetch = mock(forbiddenDownload);
    await suite.harness.installPlugin(
      new ChatInterface({ adapters: { slack: baseSlackConfig } }, undefined, {
        fetch: controllerFetch,
      }),
    );
    const chat = MockChatSdk.instances[0];
    const thread = slackThread();
    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Read this later",
        attachments: [
          {
            name: "secret.txt",
            mimeType: "text/plain",
            size: 6,
            url: files.source(Buffer.from("secret")),
            fetchData,
          },
        ],
      }),
    );
    expect(fetchData).not.toHaveBeenCalled();
    expect(controllerFetch).not.toHaveBeenCalled();
    expect(files.requests).toEqual([
      {
        path: "/source-0",
        authorization: `Bearer ${baseSlackConfig.botToken}`,
      },
    ]);
    expect(suite.agentService.chat.mock.calls[0]?.[2]).toMatchObject({
      userPermissionLevel: "trusted",
      interfaceType: "slack",
      attachments: [
        {
          kind: "file",
          filename: "secret.txt",
          sizeBytes: 6,
          source: { kind: "upload", id: expect.stringMatching(/^upload-/) },
        },
      ],
    });
    expect(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments?.[0],
    ).not.toHaveProperty("content");
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({
        text: "Use secret.txt again",
        threadId: thread.id,
        isMention: false,
      }),
    );
    expect(suite.agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
    );
    expect(files.requests).toHaveLength(1);
  });

  it.each(["slack", "discord"])(
    "does not download text, images or PDFs for public %s users",
    async (platform) => {
      const fetchData = mock(forbiddenDownload);
      await suite.harness.installPlugin(
        platform === "slack"
          ? new ChatInterface({ adapters: { slack: baseSlackConfig } })
          : createPlugin(),
      );
      const chat = MockChatSdk.instances[0];
      await chat?.handlers.mentions[0]?.(
        platform === "slack" ? slackThread() : createThread(),
        createMessage({
          text: "Read these",
          attachments: [
            {
              name: "secret.txt",
              mimeType: "text/plain",
              url: files.source(Buffer.from("secret")),
              fetchData,
            },
            {
              name: "diagram.png",
              mimeType: "image/png",
              url: files.source(png),
              fetchData,
            },
            {
              name: "brief.pdf",
              mimeType: "application/pdf",
              url: files.source(pdf),
              fetchData,
            },
          ],
        }),
      );
      expect(fetchData).not.toHaveBeenCalled();
      expect(files.requests).toHaveLength(0);
      expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Read these");
      expect(
        suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
      ).toBeUndefined();
    },
  );

  it("retains Discord text metadata without putting its contents in agent context", async () => {
    trust("discord");
    await suite.harness.installPlugin(createPlugin());
    const chat = MockChatSdk.instances[0];
    const fetchData = mock(forbiddenDownload);
    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Read this",
        attachments: [
          {
            name: "notes.txt",
            mimeType: "text/plain",
            size: 9,
            url: files.source(Buffer.from("file body")),
            fetchData,
          },
        ],
      }),
    );
    expect(fetchData).not.toHaveBeenCalled();
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Read this");
    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "file",
        filename: "notes.txt",
        mediaType: "text/plain",
        sizeBytes: 9,
        source: { kind: "upload", id: expect.stringMatching(/^upload-/) },
      },
    ]);
    const source =
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments?.[0]?.source;
    const store = suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createCanonicalChatUploadStoreScope());
    const record = await store.readRecord(source?.id ?? "");
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

  it.each(["slack", "discord"])(
    "captures %s images and PDFs as durable file references",
    async (platform) => {
      trust(platform);
      const fetchData = mock(forbiddenDownload);
      await suite.harness.installPlugin(
        platform === "slack"
          ? new ChatInterface({ adapters: { slack: baseSlackConfig } })
          : createPlugin(),
      );
      const chat = MockChatSdk.instances[0];
      await chat?.handlers.mentions[0]?.(
        platform === "slack" ? slackThread() : createThread(),
        createMessage({
          text: "Use these",
          attachments: [
            {
              name: "diagram.png",
              mimeType: "image/png",
              size: png.length,
              url: files.source(png),
              fetchData,
            },
            {
              name: "brief.pdf",
              mimeType: "application/pdf",
              size: pdf.length,
              url: files.source(pdf),
              fetchData,
            },
          ],
        }),
      );
      expect(fetchData).not.toHaveBeenCalled();
      expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
        {
          kind: "file",
          filename: "diagram.png",
          mediaType: "image/png",
          sizeBytes: png.length,
          source: { kind: "upload", id: expect.stringMatching(/^upload-/) },
        },
        {
          kind: "file",
          filename: "brief.pdf",
          mediaType: "application/pdf",
          sizeBytes: pdf.length,
          source: { kind: "upload", id: expect.stringMatching(/^upload-/) },
        },
      ]);
      expect(files.requests).toHaveLength(2);
    },
  );

  it("captures Discord URL-only gateway files without controller fetch", async () => {
    trust("discord");
    await suite.harness.installPlugin(createPlugin());
    const chat = MockChatSdk.instances[0];
    await chat?.handlers.mentions[0]?.(
      createThread(),
      createMessage({
        text: "Summarize this PDF",
        attachments: [
          {
            name: "distributed-systems-primer.pdf",
            mimeType: "application/pdf",
            url: files.source(pdf),
          },
        ],
      }),
    );
    expect(suite.agentService.chat.mock.calls[0]?.[2]?.attachments).toEqual([
      {
        kind: "file",
        filename: "distributed-systems-primer.pdf",
        mediaType: "application/pdf",
        sizeBytes: pdf.length,
        source: { kind: "upload", id: expect.stringMatching(/^upload-/) },
      },
    ]);
    expect(files.requests).toEqual([
      { path: "/source-0", authorization: null },
    ]);
  });

  it("reports unsupported, oversized and spoofed inputs before retention", async () => {
    trust("discord");
    await suite.harness.installPlugin(createPlugin());
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    const fetchData = mock(forbiddenDownload);
    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "Read these",
        attachments: [
          {
            name: "archive.bin",
            mimeType: "application/octet-stream",
            size: 10,
            fetchData,
          },
          {
            name: "huge.txt",
            mimeType: "text/plain",
            size: 1024 * 1024 + 1,
            fetchData,
          },
          {
            name: "fake-notes.txt",
            mimeType: "text/plain",
            size: 3,
            url: files.source(Buffer.from([0, 1, 2])),
            fetchData,
          },
        ],
      }),
    );
    expect(fetchData).not.toHaveBeenCalled();
    expect(files.requests).toHaveLength(1);
    expect(thread.post).toHaveBeenNthCalledWith(
      1,
      "Some uploads were skipped:\n- Unsupported file upload type: archive.bin\n- File upload too large: huge.txt\n- Unsupported file upload type: fake-notes.txt",
    );
    expect(suite.agentService.chat.mock.calls[0]?.[0]).toBe("Read these");
    expect(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
    ).toBeUndefined();
  });

  it("preserves earlier upload acknowledgements when a later capture cannot start", async () => {
    trust("discord");
    await suite.harness.installPlugin(createPlugin());
    const handler = MockChatSdk.instances[0]?.handlers.mentions[0];
    assert.ok(handler);
    let retainedId: string | undefined;
    await assert.rejects(
      handler(
        createThread(),
        createMessage({
          text: "Use both",
          attachments: [
            {
              name: "kept.txt",
              mimeType: "text/plain",
              url: files.source(Buffer.from("retained")),
            },
            { name: "missing.txt", mimeType: "text/plain" },
          ],
        }),
      ),
      (error: unknown) => {
        if (!(error instanceof RetainedUploadBatchError)) return false;
        expect(error.records).toHaveLength(1);
        expect(error.records[0]?.filename).toBe("kept.txt");
        expect(error.cause).toBeInstanceOf(Error);
        retainedId = error.records[0]?.id;
        return true;
      },
    );
    assert.ok(retainedId);
    const record = await suite.harness
      .getMockShell()
      .getRuntimeUploadRegistry()
      .scoped(createCanonicalChatUploadStoreScope())
      .readRecord(retainedId);
    expect(record.sizeBytes).toBe(8);
    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(files.requests).toHaveLength(1);
  });

  it("does not invoke the agent when only unsupported uploads remain", async () => {
    trust("discord");
    await suite.harness.installPlugin(createPlugin());
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
            fetchData: mock(forbiddenDownload),
          },
        ],
      }),
    );
    expect(suite.agentService.chat).not.toHaveBeenCalled();
    expect(thread.post).toHaveBeenCalledWith(
      "Some uploads were skipped:\n- Unsupported file upload type: archive.bin",
    );
    expect(files.requests).toHaveLength(0);
  });

  it("retains file refs after an agent failure without downloading them again", async () => {
    trust("discord");
    suite.agentService.chat
      .mockRejectedValueOnce(new Error("model unavailable"))
      .mockResolvedValueOnce({
        text: "Described upload.",
        usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      });
    await suite.harness.installPlugin(createPlugin());
    const chat = MockChatSdk.instances[0];
    const thread = createThread();
    await chat?.handlers.mentions[0]?.(
      thread,
      createMessage({
        text: "remember this image",
        attachments: [
          {
            name: "failed-turn-robot.png",
            mimeType: "image/png",
            url: files.source(png),
            fetchData: mock(forbiddenDownload),
          },
        ],
      }),
    );
    await chat?.handlers.subscribedMessages[0]?.(
      thread,
      createMessage({ text: "describe that image", isMention: false }),
    );
    expect(suite.agentService.chat).toHaveBeenCalledTimes(2);
    expect(suite.agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual(
      suite.agentService.chat.mock.calls[0]?.[2]?.attachments,
    );
    expect(files.requests).toHaveLength(1);
  });

  it.each([
    "describe the most recent image",
    "describe the first image",
    "describe first-robot.png",
  ])(
    "keeps both upload candidates for '%s' without message-text selection",
    async (text) => {
      trust("discord");
      await suite.harness.installPlugin(createPlugin());
      const chat = MockChatSdk.instances[0];
      const thread = createThread();
      await chat?.handlers.mentions[0]?.(
        thread,
        createMessage({
          text: "store these",
          attachments: [
            {
              name: "first-robot.png",
              mimeType: "image/png",
              url: files.source(png),
              fetchData: mock(forbiddenDownload),
            },
            {
              name: "second-robot.png",
              mimeType: "image/png",
              url: files.source(png),
              fetchData: mock(forbiddenDownload),
            },
          ],
        }),
      );
      await chat?.handlers.subscribedMessages[0]?.(
        thread,
        createMessage({ text, isMention: false }),
      );
      expect(suite.agentService.chat.mock.calls[1]?.[0]).toBe(text);
      expect(suite.agentService.chat.mock.calls[1]?.[2]?.attachments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "file",
            filename: "first-robot.png",
            source: expect.objectContaining({ kind: "upload" }),
          }),
          expect.objectContaining({
            kind: "file",
            filename: "second-robot.png",
            source: expect.objectContaining({ kind: "upload" }),
          }),
        ]),
      );
      expect(files.requests).toHaveLength(2);
    },
  );

  it.each(["upload", "discord-chat-upload", "slack-chat-upload"])(
    "restores only canonical refs after restart: %s",
    async (sourceKind) => {
      trust("discord");
      const store = suite.harness
        .getMockShell()
        .getRuntimeUploadRegistry()
        .scoped(
          sourceKind === "upload"
            ? createCanonicalChatUploadStoreScope()
            : {
                namespace:
                  sourceKind === "discord-chat-upload"
                    ? "discord-chat"
                    : "slack-chat",
                refKind: sourceKind,
                routePath: "",
              },
        );
      const record = await store.save({
        filename: "stored-robot.png",
        mediaType: "image/png",
        content: png,
      });
      const conversationId = "discord-discord:guild-123:channel-123:thread-456";
      suite.harness.getMockShell().getConversationService =
        (): IConversationService => ({
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
          deleteExpiredGuestConversations: mock(() => Promise.resolve(0)),
          close: mock(() => {}),
        });
      await suite.harness.installPlugin(createPlugin());
      const chat = MockChatSdk.instances[0];
      await chat?.handlers.mentions[0]?.(
        createThread(),
        createMessage({ text: "describe stored-robot.png" }),
      );
      const attachments =
        suite.agentService.chat.mock.calls[0]?.[2]?.attachments;
      if (sourceKind === "upload")
        expect(attachments).toEqual([
          expect.objectContaining({
            kind: "file",
            filename: "stored-robot.png",
            mediaType: "image/png",
            source: record.ref,
          }),
        ]);
      else expect(attachments).toBeUndefined();
      // Removing compatibility must not delete retained recovery data.
      expect(await store.readRecord(record.id)).toEqual(record);
      expect(files.requests).toHaveLength(0);
    },
  );
});
