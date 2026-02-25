import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { BaseEntity } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";
import { TINY_PNG_BYTES } from "./fixtures";

describe("Image Import - Regression Tests", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: ReturnType<typeof createMockEntityService>;
  let upsertedEntities: Array<{ entityType: string; id: string }>;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-image-import-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    upsertedEntities = [];
    mockEntityService = createMockEntityService({
      entityTypes: ["topic", "image", "post"],
    });

    spyOn(mockEntityService, "serializeEntity").mockImplementation(
      (entity: BaseEntity): string => `# ${entity.id}\n\n${entity.content}`,
    );

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(
      (): Partial<BaseEntity> => ({ metadata: {} }),
    );

    spyOn(mockEntityService, "upsertEntity").mockImplementation(
      async (
        entity: Partial<BaseEntity>,
      ): Promise<{ entityId: string; jobId: string; created: boolean }> => {
        upsertedEntities.push({
          entityType: entity.entityType ?? "unknown",
          id: entity.id ?? "unknown",
        });
        return {
          entityId: entity.id ?? "test-id",
          jobId: "test-job",
          created: true,
        };
      },
    );

    dirSync = new DirectorySync({
      syncPath: testDir,
      entityService: mockEntityService,
      logger: createSilentLogger("test"),
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("importEntities should include image files", () => {
    it("should import image files from image/ directory when calling importEntities()", async () => {
      // Create topic markdown file
      mkdirSync(join(testDir, "topic"), { recursive: true });
      writeFileSync(
        join(testDir, "topic", "test-topic.md"),
        "# Test Topic\n\nContent",
      );

      // Create image files in image/ directory
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "photo.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "banner.webp"), TINY_PNG_BYTES);

      // Import all entities (without specifying paths)
      const result = await dirSync.importEntities();

      // Should have imported 3 entities: 1 topic + 2 images
      expect(result.imported).toBe(3);
      expect(result.failed).toBe(0);

      // Verify the entity types that were upserted
      const topicEntities = upsertedEntities.filter(
        (e) => e.entityType === "topic",
      );
      const imageEntities = upsertedEntities.filter(
        (e) => e.entityType === "image",
      );

      expect(topicEntities).toHaveLength(1);
      expect(topicEntities[0]).toEqual({
        entityType: "topic",
        id: "test-topic",
      });

      expect(imageEntities).toHaveLength(2);
      expect(imageEntities.map((e) => e.id).sort()).toEqual([
        "banner",
        "photo",
      ]);
    });

    it("should convert binary image to base64 data URL when importing", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "test-image.png"), TINY_PNG_BYTES);

      // Track the actual content passed to upsert
      let capturedContent: string | undefined;
      spyOn(mockEntityService, "upsertEntity").mockImplementation(
        async (entity: Partial<BaseEntity>) => {
          capturedContent = entity.content;
          upsertedEntities.push({
            entityType: entity.entityType ?? "unknown",
            id: entity.id ?? "unknown",
          });
          return {
            entityId: entity.id ?? "test-id",
            jobId: "test-job",
            created: true,
          };
        },
      );

      const result = await dirSync.importEntities();

      expect(result.imported).toBe(1);
      expect(upsertedEntities[0]).toEqual({
        entityType: "image",
        id: "test-image",
      });
      expect(capturedContent).toMatch(/^data:image\/png;base64,/);
    });

    it("should handle mixed import of markdown and images in single call", async () => {
      // Create various entity types
      mkdirSync(join(testDir, "topic"), { recursive: true });
      mkdirSync(join(testDir, "post"), { recursive: true });
      mkdirSync(join(testDir, "image"), { recursive: true });

      writeFileSync(join(testDir, "topic", "topic1.md"), "# Topic 1");
      writeFileSync(join(testDir, "topic", "topic2.md"), "# Topic 2");
      writeFileSync(join(testDir, "post", "blog-post.md"), "# Blog Post");
      writeFileSync(join(testDir, "image", "cover.webp"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "inline.jpg"), TINY_PNG_BYTES);

      const result = await dirSync.importEntities();

      // Should import all 5 entities
      expect(result.imported).toBe(5);

      // Verify counts by type
      const topics = upsertedEntities.filter((e) => e.entityType === "topic");
      const posts = upsertedEntities.filter((e) => e.entityType === "post");
      const images = upsertedEntities.filter((e) => e.entityType === "image");

      expect(topics).toHaveLength(2);
      expect(posts).toHaveLength(1);
      expect(images).toHaveLength(2);
    });

    it("should NOT import image files from non-image directories", async () => {
      // Create image file in wrong directory (should be ignored)
      mkdirSync(join(testDir, "topic"), { recursive: true });
      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "topic", "misplaced.png"), TINY_PNG_BYTES);

      const result = await dirSync.importEntities();

      // Should only import the markdown file, not the misplaced PNG
      expect(result.imported).toBe(1);
      expect(upsertedEntities).toHaveLength(1);
      expect(upsertedEntities[0]).toEqual({ entityType: "topic", id: "test" });
    });
  });
});
