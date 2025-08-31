import { describe, it, expect, beforeEach, mock } from "bun:test";
import { TopicsDataSource } from "../../src/datasources/topics-datasource";
import { topicDetailSchema } from "../../src/templates/topic-detail/schema";
import { topicListSchema } from "../../src/templates/topic-list/schema";
import { z } from "@brains/utils";
import type { TopicEntity } from "../../src/schemas/topic";
import { createSilentLogger } from "@brains/utils";
import type { IEntityService } from "@brains/plugins";

describe("TopicsDataSource", () => {
  let dataSource: TopicsDataSource;
  let mockEntityService: {
    getEntity: ReturnType<typeof mock>;
    listEntities: ReturnType<typeof mock>;
    getEntityTypes: ReturnType<typeof mock>;
  };

  beforeEach(() => {
    mockEntityService = {
      getEntity: mock(),
      listEntities: mock(),
      getEntityTypes: mock().mockReturnValue([]),
    };
    const logger = createSilentLogger();
    dataSource = new TopicsDataSource(
      mockEntityService as unknown as IEntityService,
      logger,
    );
  });

  describe("fetch", () => {
    it("should fetch a single entity when id is provided", async () => {
      const mockEntity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: `# Test Topic

## Summary

A test topic summary

## Content

This is the main content of the test topic.

## Keywords

- test
- topic
- example

## Sources

- source-1
- source-2`,
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-02T00:00:00Z",
      };

      mockEntityService.getEntity.mockResolvedValue(mockEntity);

      const query = {
        entityType: "topic",
        query: { id: "test-topic" },
      };

      const result = await dataSource.fetch(
        query,
        z.any(), // In practice, this would be the entity schema
      );

      expect(mockEntityService.getEntity).toHaveBeenCalledWith(
        "topic",
        "test-topic",
      );
      expect(result).toEqual(mockEntity);
    });

    it("should throw error when entity not found", async () => {
      mockEntityService.getEntity.mockResolvedValue(null);

      const query = {
        entityType: "topic",
        query: { id: "non-existent" },
      };

      await expect(dataSource.fetch(query, z.any())).rejects.toThrow(
        "Entity not found: non-existent",
      );
    });

    it("should fetch entity list when no id provided", async () => {
      const mockEntities: TopicEntity[] = [
        {
          id: "topic-1",
          entityType: "topic",
          content: "# Topic 1\n\n## Summary\n\nFirst topic",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        },
        {
          id: "topic-2",
          entityType: "topic",
          content: "# Topic 2\n\n## Summary\n\nSecond topic",
          created: "2024-01-03T00:00:00Z",
          updated: "2024-01-04T00:00:00Z",
        },
      ];

      mockEntityService.listEntities.mockResolvedValue(mockEntities);

      const query = {
        entityType: "topic",
        query: { limit: 50 },
      };

      const result = await dataSource.fetch(query, z.any());

      expect(mockEntityService.listEntities).toHaveBeenCalledWith("topic", {
        limit: 50,
      });
      expect(result).toEqual(mockEntities);
    });

    it("should use default limit when no query provided", async () => {
      mockEntityService.listEntities.mockResolvedValue([]);

      const query = {
        entityType: "topic",
      };

      await dataSource.fetch(query, z.any());

      expect(mockEntityService.listEntities).toHaveBeenCalledWith("topic", {
        limit: 100,
      });
    });

    it("should validate query parameters", async () => {
      const invalidQuery = {
        // Missing entityType
        query: { id: "test" },
      };

      await expect(dataSource.fetch(invalidQuery, z.any())).rejects.toThrow();
    });
  });

  describe("transform", () => {
    describe("detail format", () => {
      it("should transform single entity to topic detail format", async () => {
        const mockEntity: TopicEntity = {
          id: "test-topic",
          entityType: "topic",
          content: `# Test Topic

## Summary

A comprehensive test topic summary

## Content

This is the main content of the test topic with detailed information.

## Keywords

- testing
- documentation
- example

## Sources

- source-1
- source-2`,
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        };

        const result = await dataSource.transform(
          mockEntity,
          "detail",
          topicDetailSchema,
        );

        expect(result).toEqual({
          id: "test-topic",
          title: "Test Topic",
          summary: "A comprehensive test topic summary",
          content:
            "This is the main content of the test topic with detailed information.",
          keywords: ["testing", "documentation", "example"],
          sources: [
            { id: "source-1", title: "Source source-1", type: "unknown" },
            { id: "source-2", title: "Source source-2", type: "unknown" },
          ],
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        });
      });

      it("should handle entity with minimal content", async () => {
        const mockEntity: TopicEntity = {
          id: "minimal-topic",
          entityType: "topic",
          content: "# Minimal Topic",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-02T00:00:00Z",
        };

        const result = await dataSource.transform(
          mockEntity,
          "detail",
          topicDetailSchema,
        );

        expect(result.id).toBe("minimal-topic");
        // When parsing fails, the adapter returns "Unknown Topic"
        expect(result.title).toBe("Unknown Topic");
        expect(result.summary).toBe("");
        expect(result.content).toBe("# Minimal Topic");
        expect(result.keywords).toEqual([]);
        expect(result.sources).toEqual([]);
      });
    });

    describe("list format", () => {
      it("should transform entity array to topic list format", async () => {
        const mockEntities: TopicEntity[] = [
          {
            id: "topic-1",
            entityType: "topic",
            content: `# First Topic

## Summary

Summary of first topic

## Content

Content of first topic

## Keywords

- first
- test

## Sources

- source-1`,
            created: "2024-01-01T00:00:00Z",
            updated: "2024-01-04T00:00:00Z", // Newer
          },
          {
            id: "topic-2",
            entityType: "topic",
            content: `# Second Topic

## Summary

Summary of second topic

## Content

Content of second topic

## Keywords

- second
- test
- example

## Sources

- source-2
- source-3`,
            created: "2024-01-02T00:00:00Z",
            updated: "2024-01-03T00:00:00Z", // Older
          },
        ];

        const result = await dataSource.transform(
          mockEntities,
          "list",
          topicListSchema,
        );

        expect(result.totalCount).toBe(2);
        expect(result.topics).toHaveLength(2);

        // Should be sorted by updated date, newest first
        expect(result.topics[0].id).toBe("topic-1");
        expect(result.topics[1].id).toBe("topic-2");

        expect(result.topics[0]).toEqual({
          id: "topic-1",
          title: "First Topic",
          summary: "Summary of first topic",
          keywords: ["first", "test"],
          sourceCount: 1,
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-04T00:00:00Z",
        });

        expect(result.topics[1]).toEqual({
          id: "topic-2",
          title: "Second Topic",
          summary: "Summary of second topic",
          keywords: ["second", "test", "example"],
          sourceCount: 2,
          created: "2024-01-02T00:00:00Z",
          updated: "2024-01-03T00:00:00Z",
        });
      });

      it("should handle empty entity list", async () => {
        const result = await dataSource.transform([], "list", topicListSchema);

        expect(result).toEqual({
          topics: [],
          totalCount: 0,
        });
      });
    });

    it("should throw error for unknown format", async () => {
      const mockEntity = { id: "test", entityType: "topic", content: "" };

      await expect(
        dataSource.transform(mockEntity, "unknown", z.any()),
      ).rejects.toThrow("Unknown transform format: unknown");
    });

    it("should validate transformed data against schema", async () => {
      const mockEntity: TopicEntity = {
        id: "test-topic",
        entityType: "topic",
        content: `# Test Topic

## Summary

Test summary`,
        created: "2024-01-01T00:00:00Z",
        updated: "2024-01-02T00:00:00Z",
      };

      // Use a schema that will fail validation
      const strictSchema = z.object({
        id: z.string(),
        required_field: z.string(), // This field won't exist
      });

      await expect(
        dataSource.transform(mockEntity, "detail", strictSchema),
      ).rejects.toThrow();
    });
  });

  describe("DataSource interface", () => {
    it("should have correct id and name", () => {
      expect(dataSource.id).toBe("topics:entities");
      expect(dataSource.name).toBe("Topics Entity DataSource");
      expect(dataSource.description).toBe(
        "Fetches and transforms topic entities for rendering",
      );
    });
  });
});
