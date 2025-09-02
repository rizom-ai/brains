import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryPlugin } from "../src/summary-plugin";
import {
  MockShell,
  createServicePluginContext,
  createSilentLogger,
  type ServicePluginContext,
  type Logger,
} from "@brains/plugins";
import { SummaryAdapter } from "../src/adapters/summary-adapter";

describe("SummaryPlugin", () => {
  let plugin: SummaryPlugin;
  let mockShell: MockShell;
  let context: ServicePluginContext;
  let logger: Logger;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = new MockShell({ logger });

    // Create service plugin context
    context = createServicePluginContext(mockShell, "summary");

    // Create and register plugin
    plugin = new SummaryPlugin({ enableAutoSummary: true });
    await plugin.register(mockShell);
  });

  // Note: Digest message handling is tested at the component level (DigestHandler)
  // Integration testing is complex and unnecessary when individual components are well tested

  describe("getSummary", () => {
    it("should retrieve existing summary", async () => {
      const adapter = new SummaryAdapter();
      const content = adapter.createSummaryContent({
        conversationId: "conv-789",
        entries: [
          {
            title: "Test Entry",
            content: "Test content",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 20,
          },
        ],
        totalMessages: 20,
        lastUpdated: "2025-01-30T10:00:00Z",
      });

      await context.entityService.upsertEntity({
        id: "summary-conv-789",
        entityType: "summary",
        content,
        created: "2025-01-30T10:00:00Z",
        updated: "2025-01-30T10:00:00Z",
        metadata: {
          conversationId: "conv-789",
          entryCount: 1,
          totalMessages: 20,
          lastUpdated: "2025-01-30T10:00:00Z",
        },
      });

      const summary = await plugin.getSummary("conv-789");
      expect(summary).not.toBeNull();
      expect(summary?.metadata?.conversationId).toBe("conv-789");
    });

    it("should return null for non-existent summary", async () => {
      const summary = await plugin.getSummary("non-existent");
      expect(summary).toBeNull();
    });
  });

  describe("deleteSummary", () => {
    it("should delete existing summary", async () => {
      await context.entityService.upsertEntity({
        id: "summary-conv-delete",
        entityType: "summary",
        content: "To be deleted",
        created: "2025-01-30T10:00:00Z",
        updated: "2025-01-30T10:00:00Z",
      });

      const result = await plugin.deleteSummary("conv-delete");
      expect(result).toBe(true);

      const summary = await plugin.getSummary("conv-delete");
      expect(summary).toBeNull();
    });
  });

  describe("getAllSummaries", () => {
    it("should retrieve all summaries", async () => {
      const adapter = new SummaryAdapter();

      // Create multiple summaries
      for (let i = 1; i <= 3; i++) {
        const content = adapter.createSummaryContent({
          conversationId: `conv-${i}`,
          entries: [
            {
              title: `Entry ${i}`,
              content: `Content ${i}`,
              created: "2025-01-30T10:00:00Z",
              updated: "2025-01-30T10:00:00Z",
              windowStart: 1,
              windowEnd: 10,
            },
          ],
          totalMessages: 10,
          lastUpdated: "2025-01-30T10:00:00Z",
        });

        await context.entityService.upsertEntity({
          id: `summary-conv-${i}`,
          entityType: "summary",
          content,
          created: "2025-01-30T10:00:00Z",
          updated: "2025-01-30T10:00:00Z",
        });
      }

      const summaries = await plugin.getAllSummaries();
      expect(summaries.length).toBe(3);
      expect(summaries[0]?.id).toContain("summary-conv-");
    });
  });

  describe("exportSummary", () => {
    it("should export summary as markdown", async () => {
      const adapter = new SummaryAdapter();
      const content = adapter.createSummaryContent({
        conversationId: "conv-export",
        entries: [
          {
            title: "Export Test",
            content: "This is exportable content",
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: 1,
            windowEnd: 10,
            keyPoints: ["Point 1", "Point 2"],
            decisions: ["Decision 1"],
            actionItems: ["Action 1"],
            participants: ["Alice"],
          },
        ],
        totalMessages: 10,
        lastUpdated: "2025-01-30T10:00:00Z",
      });

      await context.entityService.upsertEntity({
        id: "summary-conv-export",
        entityType: "summary",
        content,
        created: "2025-01-30T10:00:00Z",
        updated: "2025-01-30T10:00:00Z",
      });

      const exported = await plugin.exportSummary("conv-export");
      expect(exported).toContain("# Conversation Summary: conv-export");
      expect(exported).toContain("Export Test");
      expect(exported).toContain("This is exportable content");
      expect(exported).toContain("Point 1");
      expect(exported).toContain("Decision 1");
    });
  });

  describe("getStatistics", () => {
    it("should calculate statistics correctly", async () => {
      const adapter = new SummaryAdapter();

      // Create summaries with different entry counts
      const summaryData = [
        { id: "conv-1", entryCount: 3 },
        { id: "conv-2", entryCount: 5 },
        { id: "conv-3", entryCount: 2 },
      ];

      for (const data of summaryData) {
        const entries = [];
        for (let i = 1; i <= data.entryCount; i++) {
          entries.push({
            title: `Entry ${i}`,
            content: `Content ${i}`,
            created: "2025-01-30T10:00:00Z",
            updated: "2025-01-30T10:00:00Z",
            windowStart: (i - 1) * 10 + 1,
            windowEnd: i * 10,
          });
        }

        const content = adapter.createSummaryContent({
          conversationId: data.id,
          entries,
          totalMessages: data.entryCount * 10,
          lastUpdated: "2025-01-30T10:00:00Z",
        });

        await context.entityService.upsertEntity({
          id: `summary-${data.id}`,
          entityType: "summary",
          content,
          created: "2025-01-30T10:00:00Z",
          updated: "2025-01-30T10:00:00Z",
          metadata: {
            conversationId: data.id,
            entryCount: data.entryCount,
            totalMessages: data.entryCount * 10,
            lastUpdated: "2025-01-30T10:00:00Z",
          },
        });
      }

      const stats = await plugin.getStatistics();
      expect(stats.totalSummaries).toBe(3);
      expect(stats.totalEntries).toBe(10); // 3 + 5 + 2
      expect(stats.averageEntriesPerSummary).toBeCloseTo(3.33, 1);
    });
  });

  describe("cleanup", () => {
    it("should clean up resources", async () => {
      // Plugin already initialized with auto-summary enabled
      await plugin.cleanup();

      // Verify cleanup was successful (no errors thrown)
      expect(true).toBe(true);
    });
  });
});
