import { createTestEntity } from "@brains/entity-service/test";
import { createPluginHarness, type MockShell } from "@brains/plugins/test";
import { describe, it, expect, beforeEach } from "bun:test";
import type { BaseDataSourceContext, DataSource } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { LinkStatus, LinkEntity } from "../src/schemas/link";
import { linkPlugin } from "./link-plugin";

describe("the links data source", () => {
  let datasource: DataSource & Required<Pick<DataSource, "fetch">>;
  let shell: MockShell;
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
      // A store row: the stored document, its frontmatter decoded beside it.
      metadata: {
        status,
        title,
        url: `https://example.com/${id}`,
        description: `Description for ${title}`,
        capturedAt,
        source: { ref: "manual:local", label: "Manual" },
      },
    });
  };

  beforeEach(async () => {
    const harness = createPluginHarness();
    await harness.installPlugin(linkPlugin());
    shell = harness.getMockShell();
    mockContext = { entityService: shell.getEntityService() };
    const registered = harness.getDataSources().get("link:entities");
    if (!registered?.fetch) throw new Error("No links data source");
    datasource = { ...registered, fetch: registered.fetch.bind(registered) };
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

  describe("fetchLink", () => {
    it("shows one link by its id, with its summary and its neighbors", async () => {
      shell.addEntities([
        createMockLink(
          "link-old",
          "Oldest",
          "published",
          "2025-01-01T10:00:00.000Z",
        ),
        createMockLink(
          "link-mid",
          "Middle",
          "draft",
          "2025-01-02T10:00:00.000Z",
        ),
        createMockLink(
          "link-new",
          "Newest",
          "published",
          "2025-01-03T10:00:00.000Z",
        ),
      ]);
      const result = await datasource.fetch(
        { entityType: "link", query: { id: "link-mid" } },
        z.looseObject({
          link: z.looseObject({}),
          prevLink: z.looseObject({ id: z.string() }).nullable(),
          nextLink: z.looseObject({ id: z.string() }).nullable(),
        }),
        mockContext,
      );
      expect(result.link).toEqual({
        id: "link-mid",
        status: "draft",
        title: "Middle",
        url: "https://example.com/link-mid",
        capturedAt: "2025-01-02T10:00:00.000Z",
        source: { ref: "manual:local", label: "Manual" },
        domain: "example.com",
        description: "Description for Middle",
        summary: "Summary for Middle",
      });
      expect(result.prevLink?.id).toBe("link-new");
      expect(result.nextLink?.id).toBe("link-old");
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
