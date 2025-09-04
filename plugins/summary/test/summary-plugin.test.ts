import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { SummaryPlugin } from "../src";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
} from "@brains/plugins";
import type { ConversationDigestPayload } from "@brains/plugins";

describe("SummaryPlugin", () => {
  let plugin: SummaryPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger });
    plugin = new SummaryPlugin();
  });

  afterEach(() => {
    mock.restore();
  });

  it("should be instantiable", () => {
    expect(plugin).toBeDefined();
  });

  it("should have correct plugin name", () => {
    expect(plugin.id).toBe("summary");
  });

  it("should have plugin metadata", () => {
    expect(plugin.version).toBeDefined();
    expect(plugin.id).toBe("summary");
  });

  describe("initialization", () => {
    it("should initialize with default config", async () => {
      const context = createServicePluginContext(mockShell, "summary");
      await plugin.initialize(context, logger);

      const config = plugin.getConfig();
      expect(config.enableAutoSummary).toBe(true);
      expect(config.includeDecisions).toBe(true);
      expect(config.includeActionItems).toBe(true);
      expect(config.maxSummaryLength).toBe(500);
    });

    it("should initialize with custom config", async () => {
      const customPlugin = new SummaryPlugin({
        enableAutoSummary: false,
        maxSummaryLength: 1000,
      });

      const context = createServicePluginContext(mockShell, "summary");
      await customPlugin.initialize(context, logger);

      const config = customPlugin.getConfig();
      expect(config.enableAutoSummary).toBe(false);
      expect(config.maxSummaryLength).toBe(1000);
    });

    it("should subscribe to conversation digest events when auto-summary is enabled", async () => {
      const context = createServicePluginContext(mockShell, "summary");
      const subscribeSpy = spyOn(context, "subscribe");

      await plugin.initialize(context, logger);

      expect(subscribeSpy).toHaveBeenCalledWith(
        "conversation.digest",
        expect.any(Function),
      );
    });

    it("should not subscribe to events when auto-summary is disabled", async () => {
      const customPlugin = new SummaryPlugin({
        enableAutoSummary: false,
      });

      const context = createServicePluginContext(mockShell, "summary");
      const subscribeSpy = spyOn(context, "subscribe");

      await customPlugin.initialize(context, logger);

      expect(subscribeSpy).not.toHaveBeenCalled();
    });
  });

  describe("digest handling", () => {
    it("should subscribe to digest events and handle them", async () => {
      const context = createServicePluginContext(mockShell, "summary");

      // Set up spy before initialization
      const subscribeSpy = spyOn(context, "subscribe");

      await plugin.initialize(context, logger);

      // Verify subscription was made
      expect(subscribeSpy).toHaveBeenCalledWith(
        "conversation.digest",
        expect.any(Function),
      );

      const handler = subscribeSpy.mock.calls[0]?.[1];
      expect(handler).toBeDefined();

      if (handler) {
        const digest: ConversationDigestPayload = {
          conversationId: "conv-123",
          messageCount: 10,
          windowSize: 50,
          windowStart: 1,
          windowEnd: 50,
          messages: [
            {
              id: "msg-1",
              conversationId: "conv-123",
              role: "assistant",
              content: "Hello",
              timestamp: new Date().toISOString(),
              metadata: null,
            },
            {
              id: "msg-2",
              conversationId: "conv-123",
              role: "user",
              content: "How are you?",
              timestamp: new Date().toISOString(),
              metadata: null,
            },
            {
              id: "msg-3",
              conversationId: "conv-123",
              role: "assistant",
              content: "I'm doing great!",
              timestamp: new Date().toISOString(),
              metadata: null,
            },
          ],
          timestamp: new Date().toISOString(),
        };

        // Mock the necessary services for the digest handler
        spyOn(context.entityService, "getEntity").mockResolvedValue(null);
        spyOn(context.entityService, "upsertEntity").mockResolvedValue({
          entityId: "summary-conv-123",
          jobId: "job-123",
          created: true,
        });

        // Mock content generation
        const generateContentSpy = spyOn(context, "generateContent");
        generateContentSpy.mockResolvedValueOnce({
          decision: "new",
          title: "Greeting conversation",
          reasoning: "Initial conversation",
        });
        generateContentSpy.mockResolvedValueOnce({
          content: "A brief greeting exchange.",
          keyPoints: ["Greeting"],
          decisions: [],
          actionItems: [],
          participants: ["user-1", "assistant"],
        });

        // Test the handler
        const result = await handler({
          id: "msg-1",
          type: "conversation.digest",
          source: "test",
          payload: digest,
          timestamp: new Date().toISOString(),
        });
        expect(result).toEqual({ success: true });
      }
    });
  });

  describe("summary operations", () => {
    let context: ReturnType<typeof createServicePluginContext>;

    beforeEach(async () => {
      context = createServicePluginContext(mockShell, "summary");
      await plugin.initialize(context, logger);
    });

    it("should get summary for a conversation", async () => {
      const mockSummary = {
        id: "summary-conv-123",
        entityType: "summary" as const,
        content: "# Summary\n\nTest content",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 1,
          totalMessages: 10,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      spyOn(context.entityService, "getEntity").mockResolvedValue(mockSummary);

      const result = await plugin.getSummary("conv-123");
      expect(result).toEqual(mockSummary);
    });

    it("should return null for non-existent summary", async () => {
      spyOn(context.entityService, "getEntity").mockRejectedValue(
        new Error("Not found"),
      );

      const result = await plugin.getSummary("non-existent");
      expect(result).toBeNull();
    });

    it("should delete summary for a conversation", async () => {
      spyOn(context.entityService, "deleteEntity").mockResolvedValue(true);

      const result = await plugin.deleteSummary("conv-123");
      expect(result).toBe(true);
    });

    it("should handle delete failure gracefully", async () => {
      spyOn(context.entityService, "deleteEntity").mockRejectedValue(
        new Error("Delete failed"),
      );

      const result = await plugin.deleteSummary("conv-123");
      expect(result).toBe(false);
    });

    it("should get all summaries", async () => {
      const mockSummaries = [
        {
          id: "summary-1",
          entityType: "summary" as const,
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
        },
        {
          id: "summary-2",
          entityType: "summary" as const,
          content: "content2",
          created: "2025-01-02T00:00:00Z",
          updated: "2025-01-02T00:00:00Z",
        },
      ];

      spyOn(context.entityService, "listEntities").mockResolvedValue(
        mockSummaries,
      );

      const result = await plugin.getAllSummaries();
      expect(result).toEqual(mockSummaries);
    });

    it("should export summary as markdown", async () => {
      const mockSummary = {
        id: "summary-conv-123",
        entityType: "summary" as const,
        content: "# Summary Export\n\nTest content for export",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      spyOn(context.entityService, "getEntity").mockResolvedValue(mockSummary);

      const result = await plugin.exportSummary("conv-123");
      expect(result).toBe("# Summary Export\n\nTest content for export");
    });

    it("should return null when exporting non-existent summary", async () => {
      spyOn(context.entityService, "getEntity").mockRejectedValue(
        new Error("Not found"),
      );

      const result = await plugin.exportSummary("non-existent");
      expect(result).toBeNull();
    });

    it("should calculate statistics correctly", async () => {
      const mockSummaries = [
        {
          id: "summary-1",
          entityType: "summary" as const,
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "conv-1",
            entryCount: 3,
            totalMessages: 30,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
        {
          id: "summary-2",
          entityType: "summary" as const,
          content: "content2",
          created: "2025-01-02T00:00:00Z",
          updated: "2025-01-02T00:00:00Z",
          metadata: {
            conversationId: "conv-2",
            entryCount: 2,
            totalMessages: 20,
            lastUpdated: "2025-01-02T00:00:00Z",
          },
        },
      ];

      spyOn(context.entityService, "listEntities").mockResolvedValue(
        mockSummaries,
      );

      const stats = await plugin.getStatistics();
      expect(stats.totalSummaries).toBe(2);
      expect(stats.totalEntries).toBe(5);
      expect(stats.averageEntriesPerSummary).toBe(2.5);
    });
  });

  describe("cleanup", () => {
    it("should clean up resources properly", async () => {
      const context = createServicePluginContext(mockShell, "summary");
      await plugin.initialize(context, logger);

      await plugin.cleanup();

      // Verify cleanup was called (plugin should still be functional but handler reset)
      expect(plugin).toBeDefined();
    });
  });

  describe("plugin capabilities", () => {
    it("should register and return capabilities including tools and commands", async () => {
      const capabilities = await plugin.register(mockShell);

      expect(capabilities).toBeDefined();
      expect(capabilities.tools).toBeDefined();
      expect(capabilities.commands).toBeDefined();
      expect(Array.isArray(capabilities.tools)).toBe(true);
      expect(Array.isArray(capabilities.commands)).toBe(true);

      // Check for expected tool names
      const toolNames = capabilities.tools.map((t) => t.name);
      expect(toolNames).toContain("summary-get");
      expect(toolNames).toContain("summary-list");
      expect(toolNames).toContain("summary-export");
      expect(toolNames).toContain("summary-delete");
      expect(toolNames).toContain("summary-stats");

      // Check for expected command names
      const commandNames = capabilities.commands.map((c) => c.name);
      expect(commandNames).toContain("summary-list");
      expect(commandNames).toContain("summary-get");
      expect(commandNames).toContain("summary-export");
      expect(commandNames).toContain("summary-delete");
      expect(commandNames).toContain("summary-stats");
    });
  });
});
