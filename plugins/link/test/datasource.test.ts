import { describe, it, expect, beforeEach, spyOn } from "bun:test";
import { LinksDataSource } from "../src/datasources/links-datasource";
import type { IEntityService, BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils";
import type { LinkStatus, LinkEntity } from "../src/schemas/link";
import {
  createMockLogger,
  createMockEntityService,
  createTestEntity,
} from "@brains/test-utils";

describe("LinksDataSource", () => {
  let datasource: LinksDataSource;
  let mockEntityService: IEntityService;
  let mockLogger: Logger;
  let mockContext: BaseDataSourceContext;

  // Helper to create mock link entities with frontmatter format
  const createMockLink = (
    id: string,
    title: string,
    status: LinkStatus,
    capturedAt: string,
  ): LinkEntity => {
    const content = `---
status: ${status}
title: ${title}
url: https://example.com/${id}
description: Description for ${title}
keywords:
  - test
  - example
domain: example.com
capturedAt: '${capturedAt}'
source:
  ref: 'manual:local'
  label: Manual
---

Summary for ${title}`;
    return createTestEntity<LinkEntity>("link", {
      id,
      content,
      created: capturedAt,
      updated: capturedAt,
      metadata: {
        title,
        status,
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    mockEntityService = createMockEntityService();
    mockContext = { entityService: mockEntityService };

    datasource = new LinksDataSource(mockLogger);
  });

  describe("fetchLinkList", () => {
    const listSchema = z.object({
      links: z.array(z.any()),
      totalCount: z.number(),
    });

    it("should show only published links when context entityService is scoped to published", async () => {
      // When publishedOnly is true, the context.entityService is a scoped wrapper
      // that automatically filters. Mock returns only published links.
      const publishedLinks = [
        createMockLink(
          "link-1",
          "Published Link",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-4",
          "Another Published",
          "published",
          "2025-01-04T10:00:00.000Z",
        ),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(
        publishedLinks,
      );

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        mockContext,
      );

      expect(result.links).toHaveLength(2);
      expect(
        result.links.every((l: { status: string }) => l.status === "published"),
      ).toBe(true);
      expect(result.totalCount).toBe(2);

      // Datasource calls listEntities without publishedOnly - filtering is handled by scoped entityService
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("link", {
        limit: 1000,
      });
    });

    it("should show all links when context entityService returns all", async () => {
      // When the context entityService is not scoped (preview mode), it returns all links
      const links = [
        createMockLink(
          "link-1",
          "Published Link",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-2",
          "Draft Link",
          "draft",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockLink(
          "link-3",
          "Pending Link",
          "pending",
          "2025-01-03T10:00:00.000Z",
        ),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(links);

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        mockContext,
      );

      expect(result.links).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      // Verify we have multiple statuses
      const statuses = result.links.map((l: { status: string }) => l.status);
      expect(statuses).toContain("published");
      expect(statuses).toContain("draft");
      expect(statuses).toContain("pending");

      // Datasource calls listEntities without publishedOnly - filtering is handled by scoped entityService
      expect(mockEntityService.listEntities).toHaveBeenCalledWith("link", {
        limit: 1000,
      });
    });

    it("should sort links by captured date, newest first", async () => {
      const links = [
        createMockLink("link-1", "Oldest", "draft", "2025-01-01T10:00:00.000Z"),
        createMockLink("link-2", "Newest", "draft", "2025-01-03T10:00:00.000Z"),
        createMockLink("link-3", "Middle", "draft", "2025-01-02T10:00:00.000Z"),
      ];

      spyOn(mockEntityService, "listEntities").mockResolvedValue(links);

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
