import { describe, it, expect, beforeEach, mock } from "bun:test";
import { LinksDataSource } from "../src/datasources/links-datasource";
import type { IEntityService, Logger } from "@brains/plugins";
import type { BaseDataSourceContext } from "@brains/datasource";
import { z, computeContentHash } from "@brains/utils";
import type { LinkStatus } from "../src/schemas/link";

describe("LinksDataSource", () => {
  let datasource: LinksDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  // Helper to create mock link entities
  const createMockLink = (
    id: string,
    title: string,
    status: LinkStatus,
    capturedAt: string,
  ) => {
    const content = `# ${title}

## URL

https://example.com/${id}

## Status

${status}

## Description

Description for ${title}

## Summary

Summary for ${title}

## Keywords

- test
- example

## Domain

example.com

## Captured

${capturedAt}

## Source

- Manual (manual) [manual]`;
    return {
      id,
      entityType: "link",
      content,
      contentHash: computeContentHash(content),
      created: capturedAt,
      updated: capturedAt,
      metadata: {
        title,
        status,
      },
    };
  };

  beforeEach(() => {
    mockLogger = {
      debug: mock(() => {}),
      info: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
      child: mock(() => mockLogger),
    } as unknown as Logger;

    mockEntityService = {
      getEntity: mock(() => null),
      listEntities: mock(() => []),
      createEntity: mock(() => ({})),
      updateEntity: mock(() => ({})),
      deleteEntity: mock(() => ({})),
    } as unknown as IEntityService;

    mockContext = {};

    datasource = new LinksDataSource(mockEntityService, mockLogger);
  });

  describe("fetchLinkList", () => {
    const listSchema = z.object({
      links: z.array(z.any()),
      totalCount: z.number(),
    });

    it("should show only complete links when publishedOnly is true", async () => {
      const links = [
        createMockLink(
          "link-1",
          "Complete Link",
          "complete",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-2",
          "Pending Link",
          "pending",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockLink(
          "link-3",
          "Failed Link",
          "failed",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockLink(
          "link-4",
          "Another Complete",
          "complete",
          "2025-01-04T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(links);

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        { ...mockContext, publishedOnly: true },
      );

      expect(result.links).toHaveLength(2);
      expect(
        result.links.every((l: { status: string }) => l.status === "complete"),
      ).toBe(true);
      expect(result.totalCount).toBe(2);
    });

    it("should show all links (including pending/failed) when publishedOnly is false", async () => {
      const links = [
        createMockLink(
          "link-1",
          "Complete Link",
          "complete",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-2",
          "Pending Link",
          "pending",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockLink(
          "link-3",
          "Failed Link",
          "failed",
          "2025-01-03T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(links);

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        { ...mockContext, publishedOnly: false },
      );

      expect(result.links).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      // Verify we have all statuses
      const statuses = result.links.map((l: { status: string }) => l.status);
      expect(statuses).toContain("complete");
      expect(statuses).toContain("pending");
      expect(statuses).toContain("failed");
    });

    it("should sort links by captured date, newest first", async () => {
      const links = [
        createMockLink(
          "link-1",
          "Oldest",
          "complete",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-2",
          "Newest",
          "complete",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockLink(
          "link-3",
          "Middle",
          "complete",
          "2025-01-02T10:00:00.000Z",
        ),
      ];

      (
        mockEntityService.listEntities as ReturnType<typeof mock>
      ).mockResolvedValue(links);

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        mockContext,
      );

      expect(result.links).toHaveLength(3);
      expect(result.links[0].title).toBe("Newest");
      expect(result.links[1].title).toBe("Middle");
      expect(result.links[2].title).toBe("Oldest");
    });
  });

  describe("metadata", () => {
    it("should have correct datasource ID", () => {
      expect(datasource.id).toBe("link:entities");
    });

    it("should have descriptive name and description", () => {
      expect(datasource.name).toBe("Links Entity DataSource");
      expect(datasource.description).toContain("link entities");
    });
  });
});
