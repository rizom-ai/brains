import { describe, it, expect } from "bun:test";
import {
  pageMetricsSchema,
  pageMetricsFrontmatterSchema,
  pageMetricsMetadataSchema,
  createPageMetricsEntity,
} from "../src/schemas/page-metrics";

describe("Page Metrics Schema", () => {
  describe("pageMetricsFrontmatterSchema", () => {
    it("should validate complete frontmatter", () => {
      const frontmatter = {
        path: "/essays/test-post",
        totalPageviews: 150,
        lastUpdated: "2026-01-23",
        history: [
          { date: "2026-01-23", views: 50 },
          { date: "2026-01-22", views: 100 },
        ],
      };

      const result = pageMetricsFrontmatterSchema.parse(frontmatter);
      expect(result.path).toBe("/essays/test-post");
      expect(result.totalPageviews).toBe(150);
      expect(result.history).toHaveLength(2);
    });

    it("should default history to empty array", () => {
      const frontmatter = {
        path: "/",
        totalPageviews: 100,
        lastUpdated: "2026-01-23",
      };

      const result = pageMetricsFrontmatterSchema.parse(frontmatter);
      expect(result.history).toEqual([]);
    });
  });

  describe("pageMetricsMetadataSchema", () => {
    it("should include queryable fields only", () => {
      const metadata = {
        path: "/essays/test",
        totalPageviews: 100,
        lastUpdated: "2026-01-23",
      };

      const result = pageMetricsMetadataSchema.parse(metadata);
      expect(result.path).toBe("/essays/test");
      expect(result.totalPageviews).toBe(100);
      // history should NOT be in metadata
      expect((result as Record<string, unknown>)["history"]).toBeUndefined();
    });
  });

  describe("pageMetricsSchema", () => {
    it("should validate complete entity", () => {
      const entity = {
        id: "page-metrics-essays-test-post",
        entityType: "page-metrics",
        content: "---\npath: /essays/test-post\n---",
        contentHash: "abc123",
        created: "2026-01-23T00:00:00.000Z",
        updated: "2026-01-23T00:00:00.000Z",
        metadata: {
          path: "/essays/test-post",
          totalPageviews: 150,
          lastUpdated: "2026-01-23",
        },
      };

      const result = pageMetricsSchema.parse(entity);
      expect(result.entityType).toBe("page-metrics");
      expect(result.metadata.path).toBe("/essays/test-post");
    });
  });

  describe("createPageMetricsEntity", () => {
    it("should create entity with correct ID format", () => {
      const entity = createPageMetricsEntity({
        path: "/essays/my-test-post",
        views: 50,
        date: "2026-01-23",
      });

      expect(entity.id).toBe("page-metrics-essays-my-test-post");
      expect(entity.entityType).toBe("page-metrics");
      expect(entity.metadata.path).toBe("/essays/my-test-post");
      expect(entity.metadata.totalPageviews).toBe(50);
    });

    it("should handle root path", () => {
      const entity = createPageMetricsEntity({
        path: "/",
        views: 100,
        date: "2026-01-23",
      });

      expect(entity.id).toBe("page-metrics-root");
      expect(entity.metadata.path).toBe("/");
    });

    it("should initialize history with first data point", () => {
      const entity = createPageMetricsEntity({
        path: "/essays/test",
        views: 50,
        date: "2026-01-23",
      });

      // Parse frontmatter from content to check history
      expect(entity.content).toContain("history:");
      expect(entity.content).toContain("date: '2026-01-23'");
      expect(entity.content).toContain("views: 50");
    });

    it("should merge new views into existing entity", () => {
      const updated = createPageMetricsEntity({
        path: "/essays/test",
        views: 75,
        date: "2026-01-23",
        existingHistory: [{ date: "2026-01-22", views: 50 }],
        existingTotal: 50,
      });

      expect(updated.metadata.totalPageviews).toBe(125); // 50 + 75
      expect(updated.content).toContain("date: '2026-01-23'");
      expect(updated.content).toContain("date: '2026-01-22'");
    });

    it("should limit history to 30 days", () => {
      // Create history with 35 entries
      const oldHistory = Array.from({ length: 35 }, (_, i) => ({
        date: `2026-01-${String(i + 1).padStart(2, "0")}`,
        views: 10,
      }));

      const entity = createPageMetricsEntity({
        path: "/essays/test",
        views: 20,
        date: "2026-02-05",
        existingHistory: oldHistory,
        existingTotal: 350,
      });

      // Content should have at most 30 history entries
      const historyMatches = entity.content.match(/date: '/g);
      expect(historyMatches?.length ?? 0).toBeLessThanOrEqual(30);
    });
  });
});
