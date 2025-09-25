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
import { summaryListSchema } from "../../src/templates/summary-list/schema";
import { summaryDetailSchema } from "../../src/templates/summary-detail/schema";

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
        id: "conv-123",
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
          channelName: "Test Channel",
          entryCount: 1,
          totalMessages: 50,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      const getEntitySpy = spyOn(
        mockEntityService,
        "getEntity",
      ).mockResolvedValue(mockSummary);

      const result = await datasource.fetch(
        {
          entityType: "summary",
          query: { conversationId: "conv-123" },
        },
        summaryDetailSchema,
      );

      expect(getEntitySpy).toHaveBeenCalledWith("summary", "conv-123");
      expect(result.conversationId).toBe("conv-123");
      expect(result.entryCount).toBe(1);
      expect(result.totalMessages).toBe(50);
    });

    it("should fetch single summary by ID", async () => {
      const mockSummary: SummaryEntity = {
        id: "conv-456",
        entityType: "summary",
        content: `# Conversation Summary: conv-456

**Total Messages:** 0
**Last Updated:** 2025-01-01T00:00:00Z

## Summary Log
`,
        created: "2025-01-01T00:00:00Z",
        updated: "2025-01-01T00:00:00Z",
        metadata: {
          conversationId: "conv-456",
          channelName: "Test Channel",
          entryCount: 0,
          totalMessages: 0,
          lastUpdated: "2025-01-01T00:00:00Z",
        },
      };

      const getEntitySpy = spyOn(
        mockEntityService,
        "getEntity",
      ).mockResolvedValue(mockSummary);

      const result = await datasource.fetch(
        {
          entityType: "summary",
          query: { id: "conv-456" },
        },
        summaryDetailSchema,
      );

      expect(getEntitySpy).toHaveBeenCalledWith("summary", "conv-456");
      expect(result.conversationId).toBe("conv-456");
      expect(result.entryCount).toBe(0);
      expect(result.totalMessages).toBe(0);
    });

    it("should fetch multiple summaries", async () => {
      const mockSummaries: SummaryEntity[] = [
        {
          id: "1",
          entityType: "summary",
          content: "content1",
          created: "2025-01-01T00:00:00Z",
          updated: "2025-01-01T00:00:00Z",
          metadata: {
            conversationId: "1",
            channelName: "Test Channel",
            entryCount: 1,
            totalMessages: 10,
            lastUpdated: "2025-01-01T00:00:00Z",
          },
        },
        {
          id: "2",
          entityType: "summary",
          content: "content2",
          created: "2025-01-02T00:00:00Z",
          updated: "2025-01-02T00:00:00Z",
          metadata: {
            conversationId: "2",
            channelName: "Test Channel",
            entryCount: 1,
            totalMessages: 20,
            lastUpdated: "2025-01-02T00:00:00Z",
          },
        },
      ];

      const listEntitiesSpy = spyOn(
        mockEntityService,
        "listEntities",
      ).mockResolvedValue(mockSummaries);

      const result = await datasource.fetch(
        {
          entityType: "summary",
          query: { limit: 50 },
        },
        summaryListSchema,
      );

      expect(listEntitiesSpy).toHaveBeenCalledWith("summary", { limit: 50 });
      expect(result.summaries).toHaveLength(2);
      expect(result.totalCount).toBe(2);
    });

    it("should throw error for non-existent conversation", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);

      expect(
        datasource.fetch(
          {
            entityType: "summary",
            query: { conversationId: "non-existent" },
          },
          summaryDetailSchema,
        ),
      ).rejects.toThrow("Summary not found: non-existent");
    });

    it("should throw error for non-existent ID", async () => {
      spyOn(mockEntityService, "getEntity").mockResolvedValue(null);

      expect(
        datasource.fetch(
          {
            entityType: "summary",
            query: { id: "non-existent" },
          },
          summaryDetailSchema,
        ),
      ).rejects.toThrow("Summary not found: non-existent");
    });
  });
});
