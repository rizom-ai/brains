import { describe, it, expect, spyOn } from "bun:test";
import { SummaryService } from "../../src/lib/summary-service";
import type { IEntityService } from "@brains/plugins";
import type { SummaryEntity } from "../../src/schemas/summary";

describe("SummaryService", () => {
  function createMockEntityService(): IEntityService {
    return {
      getEntity: async () => null,
      createEntity: async () => ({}),
      updateEntity: async () => ({}),
      upsertEntity: async () => {},
      deleteEntity: async () => {},
      listEntities: async () => [],
      searchEntities: async () => [],
      search: async () => [],
      getEntityTypes: async () => [],
      getRegistry: () => null,
      getCapabilities: () => ({}),
      registerEntity: () => {},
    } as unknown as IEntityService;
  }

  describe("getSummary", () => {
    it("should call getEntity with correct parameters", async () => {
      const mockEntityService = createMockEntityService();
      const getEntitySpy = spyOn(
        mockEntityService,
        "getEntity",
      ).mockResolvedValue(null);

      const service = new SummaryService(mockEntityService);
      const conversationId = "conv-123";
      await service.getSummary(conversationId);

      expect(getEntitySpy).toHaveBeenCalledWith("summary", conversationId);
    });

    it("should return null for non-existent conversation", async () => {
      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "getEntity").mockRejectedValue(
        new Error("Not found"),
      );

      const service = new SummaryService(mockEntityService);
      const result = await service.getSummary("non-existent");

      expect(result).toBeNull();
    });

    it("should return the summary entity when it exists", async () => {
      const mockEntityService = createMockEntityService();
      const mockSummary: SummaryEntity = {
        id: "conv-123",
        entityType: "summary",
        content: "# Summary\n\nContent here",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          entryCount: 1,
          totalMessages: 10,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };
      spyOn(mockEntityService, "getEntity").mockResolvedValue(mockSummary);

      const service = new SummaryService(mockEntityService);
      const result = await service.getSummary("conv-123");

      expect(result).toEqual(mockSummary);
    });
  });

  describe("deleteSummary", () => {
    it("should call deleteEntity with correct parameters", async () => {
      const mockEntityService = createMockEntityService();
      const deleteEntitySpy = spyOn(
        mockEntityService,
        "deleteEntity",
      ).mockResolvedValue(true);

      const service = new SummaryService(mockEntityService);
      const conversationId = "conv-123";
      await service.deleteSummary(conversationId);

      expect(deleteEntitySpy).toHaveBeenCalledWith("summary", conversationId);
    });

    it("should return true when deletion succeeds", async () => {
      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "deleteEntity").mockResolvedValue(true);

      const service = new SummaryService(mockEntityService);
      const result = await service.deleteSummary("conv-123");

      expect(result).toBe(true);
    });

    it("should return false when deletion fails", async () => {
      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "deleteEntity").mockRejectedValue(
        new Error("Failed"),
      );

      const service = new SummaryService(mockEntityService);
      const result = await service.deleteSummary("non-existent");

      expect(result).toBe(false);
    });
  });

  describe("getAllSummaries", () => {
    it("should call listEntities with correct parameters", async () => {
      const mockEntityService = createMockEntityService();
      const listEntitiesSpy = spyOn(
        mockEntityService,
        "listEntities",
      ).mockResolvedValue([]);

      const service = new SummaryService(mockEntityService);
      await service.getAllSummaries();

      expect(listEntitiesSpy).toHaveBeenCalledWith("summary", { limit: 1000 });
    });

    it("should return summaries when they exist", async () => {
      const mockEntityService = createMockEntityService();
      const mockSummaries: SummaryEntity[] = [
        {
          id: "1",
          entityType: "summary",
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "conv-1",
            channelName: "Test Channel",
            entryCount: 3,
            totalMessages: 30,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
        {
          id: "2",
          entityType: "summary",
          content: "content2",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "conv-2",
            channelName: "Test Channel",
            entryCount: 2,
            totalMessages: 20,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
      ];
      spyOn(mockEntityService, "listEntities").mockResolvedValue(mockSummaries);

      const service = new SummaryService(mockEntityService);
      const result = await service.getAllSummaries();

      expect(result).toEqual(mockSummaries);
    });

    it("should return empty array on error", async () => {
      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "listEntities").mockRejectedValue(
        new Error("Failed"),
      );

      const service = new SummaryService(mockEntityService);
      const result = await service.getAllSummaries();

      expect(result).toEqual([]);
    });
  });

  describe("exportSummary", () => {
    it("should return content for existing summary", async () => {
      const mockEntityService = createMockEntityService();
      const content = "# Test Summary\n\nExported content";
      const mockSummary: SummaryEntity = {
        id: "conv-123",
        entityType: "summary",
        content,
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          channelName: "Test Channel",
          entryCount: 5,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };
      spyOn(mockEntityService, "getEntity").mockResolvedValue(mockSummary);

      const service = new SummaryService(mockEntityService);
      const result = await service.exportSummary("conv-123");

      expect(result).toBe(content);
    });

    it("should return null for non-existent summary", async () => {
      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "getEntity").mockRejectedValue(
        new Error("Not found"),
      );

      const service = new SummaryService(mockEntityService);
      const result = await service.exportSummary("non-existent");

      expect(result).toBeNull();
    });
  });

  describe("getStatistics", () => {
    it("should calculate correct statistics from summaries", async () => {
      const mockEntityService = createMockEntityService();
      const mockSummaries: SummaryEntity[] = [
        {
          id: "1",
          entityType: "summary",
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "conv-1",
            channelName: "Test Channel",
            entryCount: 3,
            totalMessages: 30,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
        {
          id: "2",
          entityType: "summary",
          content: "content2",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "conv-2",
            channelName: "Test Channel",
            entryCount: 2,
            totalMessages: 20,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
      ];
      spyOn(mockEntityService, "listEntities").mockResolvedValue(mockSummaries);

      const service = new SummaryService(mockEntityService);
      const result = await service.getStatistics();

      expect(result.totalSummaries).toBe(2);
      expect(result.totalEntries).toBe(5);
      expect(result.averageEntriesPerSummary).toBe(2.5);
    });

    it("should handle empty summaries list", async () => {
      const mockEntityService = createMockEntityService();
      spyOn(mockEntityService, "listEntities").mockResolvedValue([]);

      const service = new SummaryService(mockEntityService);
      const result = await service.getStatistics();

      expect(result.totalSummaries).toBe(0);
      expect(result.totalEntries).toBe(0);
      expect(result.averageEntriesPerSummary).toBe(0);
    });

    it("should handle missing entryCount metadata", async () => {
      const mockEntityService = createMockEntityService();
      const mockSummaries: SummaryEntity[] = [
        {
          id: "1",
          entityType: "summary",
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          // metadata omitted to test missing entryCount
        },
      ];
      spyOn(mockEntityService, "listEntities").mockResolvedValue(mockSummaries);

      const service = new SummaryService(mockEntityService);
      const result = await service.getStatistics();

      expect(result.totalSummaries).toBe(1);
      expect(result.totalEntries).toBe(0);
      expect(result.averageEntriesPerSummary).toBe(0);
    });
  });
});
