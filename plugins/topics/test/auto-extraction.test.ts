import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TopicsPlugin } from "../src";
import type { ConversationDigestPayload, ServicePluginContext } from "@brains/plugins";
import { Logger } from "@brains/utils";

describe("Auto-extraction with batch processing", () => {
  let plugin: TopicsPlugin;
  let logger: Logger;

  beforeEach(() => {
    logger = Logger.getInstance().child("test");
  });

  it("should have auto-extraction enabled by default", () => {
    plugin = new TopicsPlugin();
    expect(plugin.config.enableAutoExtraction).toBe(true);
  });

  it("should allow disabling auto-extraction", () => {
    plugin = new TopicsPlugin({
      enableAutoExtraction: false,
    });
    expect(plugin.config.enableAutoExtraction).toBe(false);
  });

  it("should handle digest payloads with batch processing", async () => {
    plugin = new TopicsPlugin({
      enableAutoExtraction: true,
      autoMerge: true,
      mergeSimilarityThreshold: 0.8,
    });

    // Create a mock context with the methods we need
    const enqueueBatchMock = mock(async () => "batch-123");
    const mockContext = {
      enqueueBatch: enqueueBatchMock,
      generateContent: mock(async () => ({
        topics: [
          {
            title: "Test Topic",
            summary: "Test summary",
            content: "Test content",
            keywords: ["test"],
            relevanceScore: 0.8,
          },
        ],
      })),
      logger,
    } as unknown as ServicePluginContext;

    // Create a digest payload
    const payload: ConversationDigestPayload = {
      conversationId: "test-conv",
      messageCount: 2,
      messages: [
        {
          role: "user",
          content: "Test message",
        },
        {
          role: "assistant",
          content: "Test response",
        },
      ],
      windowStart: 1,
      windowEnd: 2,
      windowSize: 10,
      timestamp: new Date().toISOString(),
    };

    // Call the private method directly (we'll access it via prototype)
    const handleDigest = (plugin as any).handleConversationDigest.bind(plugin);
    await handleDigest(mockContext, payload);

    // Verify batch was created with correct structure
    expect(enqueueBatchMock).toHaveBeenCalled();
    const [operations, options] = enqueueBatchMock.mock.calls[0] as [any[], any];
    
    expect(operations).toHaveLength(1);
    expect(operations[0].type).toBe("topics:process-single");
    expect(operations[0].data.topic.title).toBe("Test Topic");
    expect(operations[0].data.autoMerge).toBe(true);
    expect(operations[0].data.mergeSimilarityThreshold).toBe(0.8);
    
    expect(options.priority).toBe(1);
    expect(options.source).toBe("topics-plugin");
    expect(options.metadata.operationType).toBe("batch_processing");
  });

  it("should not create batch when no topics are extracted", async () => {
    plugin = new TopicsPlugin({
      enableAutoExtraction: true,
    });

    const enqueueBatchMock = mock(async () => "batch-123");
    const mockContext = {
      enqueueBatch: enqueueBatchMock,
      generateContent: mock(async () => ({
        topics: [], // No topics extracted
      })),
      logger,
    } as unknown as ServicePluginContext;

    const payload: ConversationDigestPayload = {
      conversationId: "test-conv",
      messageCount: 1,
      messages: [{ role: "user", content: "Hi" }],
      windowStart: 1,
      windowEnd: 1,
      windowSize: 10,
      timestamp: new Date().toISOString(),
    };

    const handleDigest = (plugin as any).handleConversationDigest.bind(plugin);
    await handleDigest(mockContext, payload);

    // Verify batch was NOT created
    expect(enqueueBatchMock).not.toHaveBeenCalled();
  });
});