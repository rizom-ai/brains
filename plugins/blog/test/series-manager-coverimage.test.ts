/**
 * Tests for SeriesManager preserving coverImageId when regenerating series
 *
 * The Bug:
 * - Series has coverImageId in frontmatter (stored in content field)
 * - Post is updated, triggering SeriesManager.syncSeriesFromPosts()
 * - SeriesManager creates new content: `# ${seriesName}` (no frontmatter)
 * - coverImageId is LOST
 *
 * The Fix:
 * - SeriesManager should preserve existing content (which has frontmatter with coverImageId)
 *
 * Note: coverImageId is stored in content frontmatter, NOT in metadata
 * (see series.ts schema comments)
 */
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { SeriesManager } from "../src/services/series-manager";
import type { IEntityService, Logger } from "@brains/plugins";
import type { BlogPost } from "../src/schemas/blog-post";
import type { Series } from "../src/schemas/series";
import { computeContentHash } from "@brains/utils";

// Series content WITH coverImageId in frontmatter
const SERIES_CONTENT_WITH_COVER = `---
coverImageId: series-ecosystem-cover
name: Ecosystem Architecture
slug: ecosystem-architecture
---
# Ecosystem Architecture
`;

// Series content WITHOUT coverImageId
const SERIES_CONTENT_NO_COVER = `# Ecosystem Architecture`;

describe("SeriesManager coverImageId preservation", () => {
  let mockEntityService: IEntityService;
  let seriesManager: SeriesManager;
  let storedEntities: Map<string, Series>;

  const mockLogger = {
    debug: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    child: mock(() => mockLogger),
  } as unknown as Logger;

  beforeEach(() => {
    storedEntities = new Map();

    mockEntityService = {
      listEntities: mock(async (entityType: string) => {
        if (entityType === "post") {
          // Return a post that belongs to the series
          const post: BlogPost = {
            id: "post-1",
            entityType: "post",
            content: "# Test Post",
            contentHash: computeContentHash("# Test Post"),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            metadata: {
              title: "Test Post",
              slug: "test-post",
              status: "draft",
              seriesName: "Ecosystem Architecture",
            },
          };
          return [post];
        }
        if (entityType === "series") {
          return Array.from(storedEntities.values());
        }
        return [];
      }),
      upsertEntity: mock(async (entity: Series) => {
        storedEntities.set(entity.id, entity);
        return { entityId: entity.id, jobId: "job-1" };
      }),
      deleteEntity: mock(async () => {}),
    } as unknown as IEntityService;

    seriesManager = new SeriesManager(mockEntityService, mockLogger);
  });

  describe("Regression test: coverImageId preservation", () => {
    it("should NOT lose coverImageId when existing series has cover and sync runs", async () => {
      // This is a regression test for the bug where coverImageId was lost
      // when SeriesManager.syncSeriesFromPosts() regenerated the series

      // SETUP: Series exists with coverImageId in content frontmatter
      const existingSeries: Series = {
        id: "series-ecosystem-architecture",
        entityType: "series",
        content: SERIES_CONTENT_WITH_COVER,
        contentHash: computeContentHash(SERIES_CONTENT_WITH_COVER),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      };
      storedEntities.set(existingSeries.id, existingSeries);

      // Verify setup: series content has coverImageId
      expect(existingSeries.content).toContain(
        "coverImageId: series-ecosystem-cover",
      );

      // ACTION: Sync series from posts (simulating post update)
      await seriesManager.syncSeriesFromPosts();

      // The series should still exist and content should be preserved
      const updatedSeries = storedEntities.get("series-ecosystem-architecture");
      expect(updatedSeries).toBeDefined();
      if (!updatedSeries) throw new Error("Series should exist");

      // REGRESSION FIX: coverImageId is PRESERVED in content
      expect(updatedSeries.content).toContain(
        "coverImageId: series-ecosystem-cover",
      );
    });
  });

  describe("Fix: coverImageId should be preserved when series is regenerated", () => {
    it("should PRESERVE coverImageId in content when existing series has cover", async () => {
      // SETUP: Series exists with coverImageId in content frontmatter
      const existingSeries: Series = {
        id: "series-ecosystem-architecture",
        entityType: "series",
        content: SERIES_CONTENT_WITH_COVER,
        contentHash: computeContentHash(SERIES_CONTENT_WITH_COVER),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      };
      storedEntities.set(existingSeries.id, existingSeries);

      // ACTION: Sync series from posts
      await seriesManager.syncSeriesFromPosts();

      // FIX: coverImageId should be preserved in content
      const updatedSeries = storedEntities.get("series-ecosystem-architecture");
      expect(updatedSeries).toBeDefined();
      if (!updatedSeries) throw new Error("Series should exist");
      expect(updatedSeries.content).toContain(
        "coverImageId: series-ecosystem-cover",
      );
    });

    it("should NOT add coverImageId when series has no cover", async () => {
      // SETUP: Series exists WITHOUT coverImageId
      const existingSeries: Series = {
        id: "series-ecosystem-architecture",
        entityType: "series",
        content: SERIES_CONTENT_NO_COVER,
        contentHash: computeContentHash(SERIES_CONTENT_NO_COVER),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      };
      storedEntities.set(existingSeries.id, existingSeries);

      // ACTION: Sync series from posts
      await seriesManager.syncSeriesFromPosts();

      // Should still NOT have coverImageId
      const updatedSeries = storedEntities.get("series-ecosystem-architecture");
      expect(updatedSeries).toBeDefined();
      if (!updatedSeries) throw new Error("Series should exist");
      expect(updatedSeries.content).not.toContain("coverImageId");
    });

    it("should preserve description field from existing content", async () => {
      // SETUP: Series exists with description in frontmatter
      const contentWithDescription = `---
name: Ecosystem Architecture
slug: ecosystem-architecture
description: A comprehensive guide to ecosystem architecture
---
# Ecosystem Architecture
`;
      const existingSeries: Series = {
        id: "series-ecosystem-architecture",
        entityType: "series",
        content: contentWithDescription,
        contentHash: computeContentHash(contentWithDescription),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
          description: "A comprehensive guide to ecosystem architecture",
        },
      };
      storedEntities.set(existingSeries.id, existingSeries);

      // ACTION: Sync series from posts
      await seriesManager.syncSeriesFromPosts();

      // Description should be preserved
      const updatedSeries = storedEntities.get("series-ecosystem-architecture");
      expect(updatedSeries).toBeDefined();
      if (!updatedSeries) throw new Error("Series should exist");
      expect(updatedSeries.content).toContain("description:");
    });
  });

  describe("New series creation", () => {
    it("should create new series without coverImageId when no existing series", async () => {
      // SETUP: No existing series
      expect(storedEntities.size).toBe(0);

      // ACTION: Sync series from posts
      await seriesManager.syncSeriesFromPosts();

      // New series should be created without coverImageId
      const newSeries = storedEntities.get("series-ecosystem-architecture");
      expect(newSeries).toBeDefined();
      if (!newSeries) throw new Error("Series should exist");
      expect(newSeries.metadata.name).toBe("Ecosystem Architecture");
      expect(newSeries.content).not.toContain("coverImageId");
    });
  });

  describe("Series content unchanged scenario", () => {
    it("should skip upsert when series content hash matches", async () => {
      // SETUP: Series exists with exact same content as would be generated
      const content = "# Ecosystem Architecture";
      const existingSeries: Series = {
        id: "series-ecosystem-architecture",
        entityType: "series",
        content: content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          name: "Ecosystem Architecture",
          slug: "ecosystem-architecture",
        },
      };
      storedEntities.set(existingSeries.id, existingSeries);

      // ACTION: Sync series from posts
      await seriesManager.syncSeriesFromPosts();

      // upsertEntity should not be called (series unchanged)
      expect(mockEntityService.upsertEntity).not.toHaveBeenCalled();
    });
  });
});
