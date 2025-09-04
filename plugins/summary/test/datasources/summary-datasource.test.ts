import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
} from "bun:test";
import { SummaryDataSource } from "../../src/datasources/summary-datasource";
import { createSilentLogger } from "@brains/plugins";
import type { IEntityService } from "@brains/plugins";
import type { SummaryEntity } from "../../src/schemas/summary";
import type { SummaryListData } from "../../src/templates/summary-list/schema";
import type { SummaryDetailData } from "../../src/templates/summary-detail/schema";

describe("SummaryDataSource", () => {
  let datasource: SummaryDataSource;
  let mockEntityService: IEntityService;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(() => {
    logger = createSilentLogger();
    
    // Create mock entity service
    mockEntityService = {
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

    datasource = new SummaryDataSource(mockEntityService, logger);
  });

  afterEach(() => {
    mock.restore();
  });

  describe("initialization", () => {
    it("should have correct id", () => {
      expect(datasource.id).toBe("summary:entities");
    });

    it("should have correct name", () => {
      expect(datasource.name).toBe("Summary Entity DataSource");
    });

    it("should have description", () => {
      expect(datasource.description).toContain("summary entities");
    });
  });

  describe("fetch", () => {
    it("should fetch single summary by conversation ID", async () => {
      const mockSummary: SummaryEntity = {
        id: "summary-conv-123",
        entityType: "summary",
        content: `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 50
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

### [2025-01-01T00:00:00Z] Test Entry

## Content
Test content

## Window Start
1

## Window End
50

---

`,
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-123",
          entryCount: 1,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      const getEntitySpy = spyOn(mockEntityService, "getEntity").mockResolvedValue(mockSummary);

      const result = await datasource.fetch({
        entityType: "summary",
        query: { conversationId: "conv-123" },
      });

      expect(getEntitySpy).toHaveBeenCalledWith("summary", "summary-conv-123");
      expect(result).toEqual(mockSummary);
    });

    it("should fetch single summary by ID", async () => {
      const mockSummary: SummaryEntity = {
        id: "summary-conv-456",
        entityType: "summary",
        content: "# Test",
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      const getEntitySpy = spyOn(mockEntityService, "getEntity").mockResolvedValue(mockSummary);

      const result = await datasource.fetch({
        entityType: "summary",
        query: { id: "summary-conv-456" },
      });

      expect(getEntitySpy).toHaveBeenCalledWith("summary", "summary-conv-456");
      expect(result).toEqual(mockSummary);
    });

    it("should fetch multiple summaries", async () => {
      const mockSummaries: SummaryEntity[] = [
        {
          id: "summary-1",
          entityType: "summary",
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
        },
        {
          id: "summary-2",
          entityType: "summary",
          content: "content2",
          created: "2025-01-02T00:00:00Z",
          updated: "2025-01-02T00:00:00Z",
        },
      ];

      const listEntitiesSpy = spyOn(mockEntityService, "listEntities").mockResolvedValue(mockSummaries);

      const result = await datasource.fetch({
        entityType: "summary",
        query: { limit: 50 },
      });

      expect(listEntitiesSpy).toHaveBeenCalledWith("summary", { limit: 50 });
      expect(result).toEqual(mockSummaries);
    });

    it("should throw error for non-existent conversation", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);

      expect(
        datasource.fetch({
          entityType: "summary",
          query: { conversationId: "non-existent" },
        })
      ).rejects.toThrow("Summary not found for conversation: non-existent");
    });

    it("should throw error for non-existent ID", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);

      expect(
        datasource.fetch({
          entityType: "summary",
          query: { id: "non-existent" },
        })
      ).rejects.toThrow("Summary not found: non-existent");
    });
  });

  describe("transform", () => {
    const createMockSummary = (): SummaryEntity => ({
      id: "summary-conv-123",
      entityType: "summary",
      content: `# Conversation Summary: conv-123

## Metadata

**Total Messages:** 100
**Last Updated:** 2025-01-02T00:00:00Z

## Summary Log

### [2025-01-02T00:00:00Z] Recent Topic

## Content
Recent discussion

## Window Start
51

## Window End
100

---

### [2025-01-01T00:00:00Z] Initial Topic

## Content
Initial discussion

## Window Start
1

## Window End
50

---

`,
      created: "2025-01-01T00:00:00Z",
      updated: "2025-01-02T00:00:00Z",
      metadata: {
        conversationId: "conv-123",
        entryCount: 2,
        totalMessages: 100,
        lastUpdated: "2025-01-02T00:00:00Z",
      },
    });

    it("should transform for summary-detail template", async () => {
      const mockSummary = createMockSummary();
      
      const result = await datasource.transform<SummaryDetailData>(
        mockSummary,
        "summary-detail"
      );

      expect(result.conversationId).toBe("conv-123");
      expect(result.entryCount).toBe(2);
      expect(result.totalMessages).toBe(100);
      expect(result.lastUpdated).toBe("2025-01-02T00:00:00Z");
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]?.title).toBe("Recent Topic");
      expect(result.entries[1]?.title).toBe("Initial Topic");
    });

    it("should transform for summary-list template", async () => {
      const mockSummaries = [createMockSummary()];
      
      const result = await datasource.transform<SummaryListData>(
        mockSummaries,
        "summary-list"
      );

      expect(result.totalCount).toBe(1);
      expect(result.summaries).toHaveLength(1);
      
      const summary = result.summaries[0];
      expect(summary?.id).toBe("summary-conv-123");
      expect(summary?.conversationId).toBe("conv-123");
      expect(summary?.entryCount).toBe(2);
      expect(summary?.totalMessages).toBe(100);
      expect(summary?.latestEntry).toBe("Recent Topic");
      expect(summary?.lastUpdated).toBe("2025-01-02T00:00:00Z");
      expect(summary?.created).toBe("2025-01-01T00:00:00Z");
    });

    it("should handle single entity for list view", async () => {
      const mockSummary = createMockSummary();
      
      const result = await datasource.transform<SummaryListData>(
        mockSummary,
        "summary-list"
      );

      expect(result.totalCount).toBe(1);
      expect(result.summaries).toHaveLength(1);
    });

    it("should return data as-is for unknown template", async () => {
      const mockData = { test: "data" };
      
      const result = await datasource.transform(mockData, "unknown-template");
      
      expect(result).toEqual(mockData);
    });

    it("should handle summaries with no entries", async () => {
      const mockSummary: SummaryEntity = {
        id: "summary-empty",
        entityType: "summary",
        content: `# Conversation Summary: empty

## Metadata

**Total Messages:** 0
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log

`,
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
      };

      const result = await datasource.transform<SummaryListData>(
        [mockSummary],
        "summary-list"
      );

      expect(result.summaries[0]?.latestEntry).toBe("No entries");
    });
  });
});