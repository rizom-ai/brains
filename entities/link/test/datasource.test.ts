import { createTestEntity } from "@brains/entity-service/test";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
import { LinksDataSource } from "../src/datasources/links-datasource";
import type { BaseDataSourceContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { LinkStatus, LinkEntity } from "../src/schemas/link";
import { createMockLogger } from "@brains/test-utils";

describe("LinksDataSource", () => {
  let datasource: LinksDataSource;
  let shell: MockShell;
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
        capturedAt,
      },
    });
  };

  beforeEach(() => {
    mockLogger = createMockLogger();
    shell = createMockShell();
    mockContext = { entityService: shell.getEntityService() };

    datasource = new LinksDataSource(mockLogger);
  });

  describe("fetchLinkList", () => {
    const listSchema = z.object({
      links: z.array(z.any()),
      totalCount: z.number(),
    });

    it("should return seeded links with parsed summaries", async () => {
      shell.addEntities([
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
      ]);

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
    });

    it("should include all link statuses when entityService returns all", async () => {
      shell.addEntities([
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
      ]);

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        mockContext,
      );

      expect(result.links).toHaveLength(3);
      expect(result.totalCount).toBe(3);
      const statuses = result.links.map((l: { status: string }) => l.status);
      expect(statuses).toContain("published");
      expect(statuses).toContain("draft");
      expect(statuses).toContain("pending");
    });

    it("should sort links by capturedAt descending", async () => {
      shell.addEntities([
        createMockLink(
          "link-old",
          "Oldest Link",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-new",
          "Newest Link",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
        createMockLink(
          "link-mid",
          "Middle Link",
          "published",
          "2025-01-02T10:00:00.000Z",
        ),
      ]);

      const result = await datasource.fetch(
        { entityType: "link" },
        listSchema,
        mockContext,
      );

      expect(result.links.map((l: { id: string }) => l.id)).toEqual([
        "link-new",
        "link-mid",
        "link-old",
      ]);
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
