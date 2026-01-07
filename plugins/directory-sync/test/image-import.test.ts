import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { DirectorySync } from "../src/lib/directory-sync";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import {
  createSilentLogger,
  createMockEntityService,
} from "@brains/test-utils";

// Tiny valid PNG bytes for testing
const TINY_PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02,
  0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44,
  0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f, 0x00, 0x05, 0xfe, 0x02,
  0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
  0xae, 0x42, 0x60, 0x82,
]);

describe("Image Import - Regression Tests", () => {
  let dirSync: DirectorySync;
  let testDir: string;
  let mockEntityService: IEntityService;
  let upsertedEntities: Array<{ entityType: string; id: string }>;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-image-import-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    upsertedEntities = [];
    mockEntityService = createMockEntityService();

    spyOn(mockEntityService, "serializeEntity").mockImplementation(
      (entity: BaseEntity): string => {
        return `# ${entity.id}\n\n${entity.content}`;
      },
    );

    spyOn(mockEntityService, "deserializeEntity").mockImplementation(
      (_content: string, _entityType: string): Partial<BaseEntity> => {
        return { metadata: {} };
      },
    );

    spyOn(mockEntityService, "getEntity").mockImplementation(async () => null);

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

    spyOn(mockEntityService, "listEntities").mockImplementation(async () => []);

    spyOn(mockEntityService, "getEntityTypes").mockImplementation(
      (): string[] => {
        return ["note", "image", "post"];
      },
    );

    spyOn(mockEntityService, "hasEntityType").mockImplementation(
      (entityType: string): boolean => {
        return ["note", "image", "post"].includes(entityType);
      },
    );

    spyOn(mockEntityService, "getAsyncJobStatus").mockImplementation(
      async (): Promise<{ status: "completed"; progress: number }> => {
        return { status: "completed", progress: 100 };
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
    /**
     * REGRESSION TEST: importEntities was only importing markdown files,
     * not image files from the image/ directory.
     *
     * Bug: Line 702 in directory-sync.ts used getAllMarkdownFiles() instead of getAllSyncFiles()
     * This caused image entities in the image/ directory to never be imported into the database.
     */
    it("should import image files from image/ directory when calling importEntities()", async () => {
      // Create note markdown file
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(
        join(testDir, "note", "test-note.md"),
        "# Test Note\n\nContent",
      );

      // Create image files in image/ directory
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "photo.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "banner.webp"), TINY_PNG_BYTES);

      // Import all entities (without specifying paths)
      const result = await dirSync.importEntities();

      // Should have imported 3 entities: 1 note + 2 images
      expect(result.imported).toBe(3);
      expect(result.failed).toBe(0);

      // Verify the entity types that were upserted
      const noteEntities = upsertedEntities.filter(
        (e) => e.entityType === "note",
      );
      const imageEntities = upsertedEntities.filter(
        (e) => e.entityType === "image",
      );

      expect(noteEntities).toHaveLength(1);
      expect(noteEntities[0]).toEqual({ entityType: "note", id: "test-note" });

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
      mkdirSync(join(testDir, "note"), { recursive: true });
      mkdirSync(join(testDir, "post"), { recursive: true });
      mkdirSync(join(testDir, "image"), { recursive: true });

      writeFileSync(join(testDir, "note", "note1.md"), "# Note 1");
      writeFileSync(join(testDir, "note", "note2.md"), "# Note 2");
      writeFileSync(join(testDir, "post", "blog-post.md"), "# Blog Post");
      writeFileSync(join(testDir, "image", "cover.webp"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "inline.jpg"), TINY_PNG_BYTES);

      const result = await dirSync.importEntities();

      // Should import all 5 entities
      expect(result.imported).toBe(5);

      // Verify counts by type
      const notes = upsertedEntities.filter((e) => e.entityType === "note");
      const posts = upsertedEntities.filter((e) => e.entityType === "post");
      const images = upsertedEntities.filter((e) => e.entityType === "image");

      expect(notes).toHaveLength(2);
      expect(posts).toHaveLength(1);
      expect(images).toHaveLength(2);
    });

    it("should NOT import image files from non-image directories", async () => {
      // Create image file in wrong directory (should be ignored)
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(join(testDir, "note", "test.md"), "# Note");
      writeFileSync(join(testDir, "note", "misplaced.png"), TINY_PNG_BYTES);

      const result = await dirSync.importEntities();

      // Should only import the markdown file, not the misplaced PNG
      expect(result.imported).toBe(1);
      expect(upsertedEntities).toHaveLength(1);
      expect(upsertedEntities[0]).toEqual({ entityType: "note", id: "test" });
    });
  });
});
