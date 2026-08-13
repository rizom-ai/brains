import { describe, it, expect, mock, afterEach, setSystemTime } from "bun:test";
import { PermissionService } from "@brains/plugins/test";
import {
  ChatInterface,
  MockChatSdk,
  baseSlackConfig,
  createMessage,
  createPlugin,
  createSentMessage,
  createThread,
  isJobProcessingPost,
  setupChatInterfaceTest,
} from "./harness/chat-interface-harness";
import type {
  ChatInterfaceWithToolActivity,
  MockPostMessage,
} from "./harness/chat-interface-harness";

describe("ChatInterface tool status and progress", () => {
  const suite = setupChatInterfaceTest();

  /**
   * ProgressMessageCoordinator throttles progress edits to one per 500ms of
   * wall clock, measured with Date.now(). Elapsed time is genuinely the
   * behaviour here, so these tests move the clock past the window rather than
   * sleeping through it — exact instead of "510ms should be enough", and it
   * gives back half a second per test. The literal tracks
   * PROGRESS_EDIT_THROTTLE_MS in shell/plugins, which is module-private.
   */
  const advancePastProgressThrottle = (): void => {
    setSystemTime(new Date(Date.now() + 501));
  };

  afterEach(() => {
    setSystemTime();
  });

  it("edits Discord tool activity status messages after the agent response", async () => {
    const statusMessage = createSentMessage("status-1");
    const responseMessage = createSentMessage("response-1");
    let postCount = 0;
    const thread = createThread({
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 1 ? statusMessage : responseMessage,
        );
      }),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const toolInterface = plugin as unknown as ChatInterfaceWithToolActivity;
    suite.agentService.chat.mockImplementationOnce(
      async (_message, conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:invoking",
          toolName: "system_publish",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        await toolInterface.handleToolActivityEvent({
          type: "tool:completed",
          toolName: "system_publish",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        expect(statusMessage.edit).not.toHaveBeenCalledWith(
          expect.objectContaining({
            fallbackText: "Tool completed: publish",
          }),
        );
        return {
          text: "Agent response text.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
        };
      },
    );

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool running: publish",
        card: expect.objectContaining({ title: "Tool running" }),
      }),
    );
    expect(statusMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool completed: publish",
        card: expect.objectContaining({ title: "Tool completed" }),
      }),
    );
  });

  it("does not mark approval-requested tools as completed before confirmation", async () => {
    const statusMessage = createSentMessage("status-1");
    const responseMessage = createSentMessage("response-1");
    let postCount = 0;
    const thread = createThread({
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 1 ? statusMessage : responseMessage,
        );
      }),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const toolInterface = plugin as unknown as ChatInterfaceWithToolActivity;
    suite.agentService.chat.mockImplementationOnce(
      async (_message, conversationId) => {
        await toolInterface.handleToolActivityEvent({
          type: "tool:invoking",
          toolName: "system_create",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        await toolInterface.handleToolActivityEvent({
          type: "tool:completed",
          toolName: "system_create",
          conversationId,
          interfaceType: "discord",
          channelId: thread.id,
        });
        return {
          text: "Confirmation required.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          pendingConfirmations: [
            {
              id: "approval-1",
              toolName: "system_create",
              summary: "Generate image?",
              args: {},
            },
          ],
        };
      },
    );

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(statusMessage.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool completed: create",
      }),
    );
    expect(statusMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool awaiting approval: create",
        card: expect.objectContaining({ title: "Approval required" }),
      }),
    );
  });

  it("ignores tool activity outside enabled Discord channels", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();

    await (
      plugin as unknown as ChatInterfaceWithToolActivity
    ).handleToolActivityEvent({
      type: "tool:invoking",
      toolName: "system_publish",
      conversationId: "web-chat-session",
      interfaceType: "web-chat",
      channelId: thread.id,
    });

    expect(thread.post).not.toHaveBeenCalled();
  });

  it("reports failed Discord tool activity when no status message is tracked", async () => {
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const thread = createThread();

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();

    await (
      plugin as unknown as ChatInterfaceWithToolActivity
    ).handleToolActivityEvent({
      type: "tool:failed",
      toolName: "system_publish",
      conversationId: "discord-discord:guild-123:channel-123:thread-456",
      interfaceType: "discord",
      channelId: thread.id,
      error: "Publish failed",
    });

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Tool failed: publish: Publish failed",
        card: expect.objectContaining({ title: "Tool failed" }),
      }),
    );
  });

  it("removes completed Slack tool status when the final response arrives", async () => {
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    const toolInterface = plugin as unknown as ChatInterfaceWithToolActivity;
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
          text: "The upload is unavailable.",
          usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
          toolResults: [
            {
              toolName: "system_create",
              data: { success: false, error: "Upload ref not found" },
            },
          ],
        };
      },
    );
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];
    const statusMessage = createSentMessage("slack-create-status");
    const responseMessage = createSentMessage("slack-create-response");
    let postCount = 0;
    const thread = createThread({
      id: threadId,
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) => {
        postCount += 1;
        return Promise.resolve(
          postCount === 1 ? statusMessage : responseMessage,
        );
      }),
    });

    await chat?.handlers.mentions[0]?.(thread, createMessage());

    expect(statusMessage.delete).toHaveBeenCalledTimes(1);
    expect(statusMessage.edit).not.toHaveBeenCalledWith(
      expect.objectContaining({ fallbackText: "Tool completed: create" }),
    );
    expect(thread.post).toHaveBeenLastCalledWith("The upload is unavailable.");
  });

  it("ignores non-Discord progress events even when a Discord thread is tracked", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();
    await suite.harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "completed",
      message: "Web chat job done",
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "web-chat",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).not.toHaveBeenCalled();
    expect(thread.post).not.toHaveBeenCalled();
  });

  it("edits tracked Slack responses with text progress fallbacks", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-slack" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    advancePastProgressThrottle();
    await suite.harness.sendMessage("job-progress", {
      id: "job-slack",
      type: "job",
      status: "processing",
      message: "Building routes",
      progress: { current: 2, total: 4, percentage: 50 },
      metadata: {
        rootJobId: "job-slack",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "slack",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      "Job processing: content operations: Site 2/4 (50%)\nBuilding routes",
    );
  });

  it("uploads tracked Slack image artifacts when async jobs complete", async () => {
    suite.harness.addEntities([
      {
        id: "async-slack-image",
        entityType: "image",
        content: `data:image/png;base64,${Buffer.from("pending-placeholder").toString("base64")}`,
        metadata: { filename: "async-slack-image.png", status: "pending" },
        visibility: "shared",
      },
    ]);
    suite.harness.setPermissionService(
      new PermissionService({
        rules: [{ pattern: "slack:*", level: "trusted" }],
      }),
    );
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued image generation.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "async-image-card",
          jobId: "job-slack-image",
          title: "Async Slack image",
          attachment: {
            mediaType: "image/png",
            url: "/api/chat/attachments/image?id=async-slack-image",
            filename: "async-slack-image.png",
            source: {
              entityType: "image",
              entityId: "async-slack-image",
            },
          },
        },
      ],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      id: "slack:C123:1712345678.000100",
      channelId: "slack:C123",
      adapter: { name: "slack" },
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = new ChatInterface({ adapters: { slack: baseSlackConfig } });
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    expect(
      thread.post.mock.calls.some(
        ([post]) => typeof post === "object" && "files" in post,
      ),
    ).toBe(false);
    thread.post.mockClear();

    suite.harness.addEntities([
      {
        id: "async-slack-image",
        entityType: "image",
        content: `data:image/png;base64,${Buffer.from("completed-image").toString("base64")}`,
        metadata: { filename: "async-slack-image.png" },
        visibility: "shared",
      },
    ]);
    await suite.harness.sendMessage("job-progress", {
      id: "job-slack-image",
      type: "job",
      status: "completed",
      message: "Image ready",
      metadata: {
        rootJobId: "job-slack-image",
        operationType: "data_processing",
        operationTarget: "Image",
        interfaceType: "slack",
        channelId: thread.id,
      },
    });

    expect(thread.post).toHaveBeenCalledWith({
      raw: "",
      files: [
        expect.objectContaining({
          data: expect.any(ArrayBuffer),
          filename: "async-slack-image.png",
          mimeType: "image/png",
        }),
      ],
    });
  });

  it("edits tracked Discord agent responses for async job progress", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    advancePastProgressThrottle();
    await suite.harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "processing",
      message: "Building routes",
      progress: { current: 2, total: 4, percentage: 50 },
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job processing: content operations: Site 2/4 (50%)\nBuilding routes",
        card: expect.objectContaining({ title: "Job processing" }),
      }),
    );
  });

  it("tracks Discord artifact card jobs for async progress", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued export.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      cards: [
        {
          kind: "attachment",
          id: "card-1",
          jobId: "artifact-job-123",
          title: "Deck export",
          attachment: {
            mediaType: "application/pdf",
            url: "/api/chat/attachments/document?id=deck-1",
            filename: "deck.pdf",
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
    advancePastProgressThrottle();
    await suite.harness.sendMessage("job-progress", {
      id: "artifact-job-123",
      type: "job",
      status: "processing",
      message: "Rendering deck",
      progress: { current: 1, total: 2, percentage: 50 },
      metadata: {
        rootJobId: "artifact-job-123",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job processing: content operations: Deck 1/2 (50%)\nRendering deck",
        card: expect.objectContaining({ title: "Job processing" }),
      }),
    );
  });

  it("edits tracked Discord agent responses when async jobs complete", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await suite.harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "completed",
      message: "Done",
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job completed: content operations: Site\nDone",
        card: expect.objectContaining({ title: "Job completed" }),
      }),
    );
  });

  it("posts and edits standalone Discord progress when no agent response is tracked", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Starting background build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const agentSentMessage = createSentMessage("agent-sent-123");
    const progressSentMessage = createSentMessage("progress-sent-123");
    const thread = createThread({
      post: mock((message: MockPostMessage) =>
        Promise.resolve(
          isJobProcessingPost(message) ? progressSentMessage : agentSentMessage,
        ),
      ),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await suite.harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "processing",
      message: "Rendering PDF",
      progress: { current: 1, total: 2, percentage: 50 },
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });
    await suite.harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "completed",
      message: "Deck ready",
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job processing: content operations: Deck 1/2 (50%)\nRendering PDF",
        card: expect.objectContaining({ title: "Job processing" }),
      }),
    );
    expect(progressSentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job completed: content operations: Deck\nDeck ready",
        card: expect.objectContaining({ title: "Job completed" }),
      }),
    );
  });

  it("posts terminal Discord job updates when no progress message is tracked", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "I will watch for updates.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const thread = createThread();
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    thread.post.mockClear();
    await suite.harness.sendMessage("job-progress", {
      id: "job-untracked",
      type: "job",
      status: "failed",
      message: "Export failed",
      metadata: {
        rootJobId: "job-untracked",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(thread.post).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job failed: content operations: Deck\nExport failed",
        card: expect.objectContaining({ title: "Job failed" }),
      }),
    );
  });

  it("edits standalone Discord progress when async jobs fail", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Starting background build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
    });
    const agentSentMessage = createSentMessage("agent-sent-123");
    const progressSentMessage = createSentMessage("progress-sent-123");
    const thread = createThread({
      post: mock((message: MockPostMessage) =>
        Promise.resolve(
          isJobProcessingPost(message) ? progressSentMessage : agentSentMessage,
        ),
      ),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await suite.harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "processing",
      message: "Rendering PDF",
      progress: { current: 1, total: 2, percentage: 50 },
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });
    await suite.harness.sendMessage("job-progress", {
      id: "job-standalone",
      type: "job",
      status: "failed",
      message: "Render failed",
      metadata: {
        rootJobId: "job-standalone",
        operationType: "content_operations",
        operationTarget: "Deck",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(progressSentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText: "Job failed: content operations: Deck\nRender failed",
        card: expect.objectContaining({ title: "Job failed" }),
      }),
    );
  });

  it("edits tracked Discord agent responses when async jobs fail", async () => {
    suite.agentService.chat.mockResolvedValueOnce({
      text: "Queued build.",
      usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 },
      toolResults: [{ toolName: "site_build", jobId: "job-123" }],
    });
    const sentMessage = createSentMessage();
    const thread = createThread({
      post: mock((_message: MockPostMessage) => Promise.resolve(sentMessage)),
    });
    const plugin = createPlugin();
    await suite.harness.installPlugin(plugin);
    const chat = MockChatSdk.instances[0];

    await chat?.handlers.mentions[0]?.(thread, createMessage());
    await suite.harness.sendMessage("job-progress", {
      id: "job-123",
      type: "job",
      status: "failed",
      message: "Build failed: missing template",
      metadata: {
        rootJobId: "job-123",
        operationType: "content_operations",
        operationTarget: "Site",
        interfaceType: "discord",
        channelId: thread.id,
      },
    });

    expect(sentMessage.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackText:
          "Job failed: content operations: Site\nBuild failed: missing template",
        card: expect.objectContaining({ title: "Job failed" }),
      }),
    );
  });
});
