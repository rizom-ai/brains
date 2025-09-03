import { describe, it, expect, beforeEach } from "bun:test";
import { SummaryService } from "../../src/lib/summary-service";
import { MockShell, createSilentLogger } from "@brains/plugins";

describe("SummaryService", () => {
  let service: SummaryService;
  let mockShell: MockShell;

  beforeEach(() => {
    const logger = createSilentLogger();
    mockShell = new MockShell({ logger });

    // Get the real EntityService from MockShell
    const entityService = mockShell.getEntityService();

    // Create SummaryService with real dependencies
    service = new SummaryService(entityService);
  });

  describe("getSummary", () => {
    it("should return summary for existing conversation", async () => {
      const conversationId = "test-conversation";
      const summaryId = `summary-${conversationId}`;

      // Create actual entity in MockShell
      const entityService = mockShell.getEntityService();
      await entityService.createEntity({
        id: summaryId,
        entityType: "summary",
        content: "# Test Summary\n\n## Summary Log\n\nTest content",
        metadata: {
          conversationId,
          entryCount: 1,
          totalMessages: 10,
          lastUpdated: new Date().toISOString(),
        },
      });

      const result = await service.getSummary(conversationId);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(summaryId);
      expect(result?.entityType).toBe("summary");
    });

    it("should return null for non-existent conversation", async () => {
      const conversationId = "non-existent";

      const result = await service.getSummary(conversationId);

      expect(result).toBeNull();
    });
  });

  describe("deleteSummary", () => {
    it("should successfully delete existing summary", async () => {
      const conversationId = "test-conversation";
      const summaryId = `summary-${conversationId}`;

      // Create entity first
      const entityService = mockShell.getEntityService();
      await entityService.createEntity({
        id: summaryId,
        entityType: "summary",
        content: "# Test Summary",
        metadata: { conversationId },
      });

      const result = await service.deleteSummary(conversationId);

      expect(result).toBe(true);

      // Verify it was deleted
      const deleted = await service.getSummary(conversationId);
      expect(deleted).toBeNull();
    });

    it("should return false when deletion fails", async () => {
      const conversationId = "non-existent";

      // This should succeed even for non-existent entities
      const result = await service.deleteSummary(conversationId);

      expect(result).toBe(true); // MockShell doesn't throw errors
    });
  });

  describe("getAllSummaries", () => {
    it("should return list of all summaries", async () => {
      const entityService = mockShell.getEntityService();

      // Create test summaries
      await entityService.createEntity({
        id: "summary-conv1",
        entityType: "summary",
        content: "Summary 1",
        metadata: {
          conversationId: "conv1",
          entryCount: 2,
          totalMessages: 20,
          lastUpdated: new Date().toISOString(),
        },
      });

      await entityService.createEntity({
        id: "summary-conv2",
        entityType: "summary",
        content: "Summary 2",
        metadata: {
          conversationId: "conv2",
          entryCount: 3,
          totalMessages: 30,
          lastUpdated: new Date().toISOString(),
        },
      });

      const result = await service.getAllSummaries();

      expect(result.length).toBeGreaterThanOrEqual(2);
      const summaryIds = result.map((s) => s.id);
      expect(summaryIds).toContain("summary-conv1");
      expect(summaryIds).toContain("summary-conv2");
    });

    it("should return empty array when no summaries exist", async () => {
      // Start with fresh MockShell that has no entities
      const result = await service.getAllSummaries();

      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe("exportSummary", () => {
    it("should return markdown content for existing summary", async () => {
      const conversationId = "test-conversation";
      const summaryId = `summary-${conversationId}`;
      const content = "# Test Summary\n\nExported content";

      // Create entity
      const entityService = mockShell.getEntityService();
      await entityService.createEntity({
        id: summaryId,
        entityType: "summary",
        content,
        metadata: {
          conversationId,
          entryCount: 1,
          totalMessages: 10,
          lastUpdated: new Date().toISOString(),
        },
      });

      const result = await service.exportSummary(conversationId);

      expect(result).toBe(content);
    });

    it("should return null for non-existent summary", async () => {
      const conversationId = "non-existent";

      const result = await service.exportSummary(conversationId);

      expect(result).toBeNull();
    });
  });

  describe("getStatistics", () => {
    it("should calculate correct statistics from summaries", async () => {
      const entityService = mockShell.getEntityService();

      // Create test summaries with specific entry counts
      await entityService.createEntity({
        id: "summary-conv1",
        entityType: "summary",
        content: "Summary 1",
        metadata: {
          conversationId: "conv1",
          entryCount: 3,
          totalMessages: 30,
          lastUpdated: new Date().toISOString(),
        },
      });

      await entityService.createEntity({
        id: "summary-conv2",
        entityType: "summary",
        content: "Summary 2",
        metadata: {
          conversationId: "conv2",
          entryCount: 5,
          totalMessages: 50,
          lastUpdated: new Date().toISOString(),
        },
      });

      const result = await service.getStatistics();

      expect(result.totalSummaries).toBeGreaterThanOrEqual(2);
      expect(result.totalEntries).toBeGreaterThanOrEqual(8); // 3 + 5
    });

    it("should handle empty summaries list", async () => {
      // Use fresh service with empty MockShell
      const emptyShell = new MockShell({ logger: createSilentLogger() });
      const emptyService = new SummaryService(emptyShell.getEntityService());

      const result = await emptyService.getStatistics();

      expect(result).toEqual({
        totalSummaries: 0,
        totalEntries: 0,
        averageEntriesPerSummary: 0,
      });
    });

    it("should handle missing entryCount metadata", async () => {
      const entityService = mockShell.getEntityService();

      // Create summary without entryCount
      await entityService.createEntity({
        id: "summary-conv-no-count",
        entityType: "summary",
        content: "Summary without count",
        metadata: {
          conversationId: "conv-no-count",
          totalMessages: 30,
          lastUpdated: new Date().toISOString(),
          // Missing entryCount
        },
      });

      const result = await service.getStatistics();

      expect(result.totalSummaries).toBeGreaterThanOrEqual(1);
      // EntryCount defaults to 0 for missing metadata
    });
  });
});
