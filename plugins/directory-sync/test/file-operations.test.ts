import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { FileOperations } from "../src/lib/file-operations";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import { computeContentHash } from "@brains/utils";

describe("FileOperations", () => {
  let fileOps: FileOperations;
  let testDir: string;
  let mockEntityService: IEntityService;

  beforeEach(() => {
    // Create a unique test directory
    testDir = join(tmpdir(), `test-file-ops-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Create a minimal mock entity service
    mockEntityService = {
      serializeEntity: (entity: BaseEntity) => {
        return `# ${entity.id}\n\n${entity.content}`;
      },
      deserializeEntity: (_content: string, _entityType: string) => {
        return { metadata: {} };
      },
    } as IEntityService;

    fileOps = new FileOperations(testDir, mockEntityService);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("Entity ID Reconstruction from Path", () => {
    it("should reconstruct colon-based IDs from nested paths", async () => {
      // Create a nested file structure
      const nestedDir = join(testDir, "site-content", "landing");
      mkdirSync(nestedDir, { recursive: true });

      const filePath = join(nestedDir, "hero.md");
      writeFileSync(filePath, "# Hero Content");

      // Read entity
      const entity = await fileOps.readEntity("site-content/landing/hero.md");

      expect(entity.entityType).toBe("site-content");
      expect(entity.id).toBe("landing:hero");
    });

    it("should handle simple files without subdirectories", async () => {
      mkdirSync(join(testDir, "note"), { recursive: true });
      writeFileSync(join(testDir, "note", "simple.md"), "# Note");

      const entity = await fileOps.readEntity("note/simple.md");

      expect(entity.entityType).toBe("note");
      expect(entity.id).toBe("simple");
    });

    it("should handle deeply nested structures", async () => {
      const deepDir = join(testDir, "topic", "tech", "web", "frontend");
      mkdirSync(deepDir, { recursive: true });
      writeFileSync(join(deepDir, "react.md"), "# React");

      const entity = await fileOps.readEntity(
        "topic/tech/web/frontend/react.md",
      );

      expect(entity.entityType).toBe("topic");
      expect(entity.id).toBe("tech:web:frontend:react");
    });

    it("should roundtrip entities with colon IDs correctly", async () => {
      // Write entity with colon ID
      const entityContent = "# Hero Section";
      const entity = {
        id: "landing:hero",
        entityType: "site-content",
        content: entityContent,
        contentHash: computeContentHash(entityContent),
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await fileOps.writeEntity(entity);

      // Verify file was created in the right place
      const expectedPath = join(testDir, "site-content", "landing", "hero.md");
      expect(existsSync(expectedPath)).toBe(true);

      // Read it back
      const readEntity = await fileOps.readEntity(
        "site-content/landing/hero.md",
      );
      expect(readEntity.id).toBe("landing:hero");
      expect(readEntity.entityType).toBe("site-content");
    });
  });

  describe("Entity ID Path Mapping", () => {
    describe("getEntityFilePath", () => {
      it("should map simple entity IDs to flat files", () => {
        const testContent = "test";
        const entity = {
          id: "simple-id",
          entityType: "note",
          content: testContent,
          contentHash: computeContentHash(testContent),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "note", "simple-id.md"));
      });

      it("should map entity IDs with colons to subdirectories", () => {
        const content = "test";
        const entity = {
          id: "daily:2024-01-27",
          entityType: "summary",
          content,
          contentHash: computeContentHash(content),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "summary", "daily", "2024-01-27.md"));
      });

      it("should handle multiple colons creating nested directories", () => {
        const content = "test";
        const entity = {
          id: "tech:ai:llms:gpt4",
          entityType: "topic",
          content,
          contentHash: computeContentHash(content),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(
          join(testDir, "topic", "tech", "ai", "llms", "gpt4.md"),
        );
      });

      it("should handle base entities without subdirectories", () => {
        const content = "test";
        const entity = {
          id: "base:entity:test",
          entityType: "base",
          content,
          contentHash: computeContentHash(content),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        // Base entities go in root, "base:" prefix is stripped since it matches entity type
        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "entity", "test.md"));
      });

      it("should handle empty ID parts gracefully", () => {
        const content = "test";
        const entity = {
          id: "summary::2024", // Double colon
          entityType: "summary",
          content,
          contentHash: computeContentHash(content),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const path = fileOps.getEntityFilePath(entity);
        // Should skip empty parts
        expect(path).toBe(join(testDir, "summary", "2024.md"));
      });
    });

    describe("writeEntity with subdirectories", () => {
      it("should create necessary subdirectories when writing", async () => {
        const entityContent = "Daily summary content";
        const entity = {
          id: "daily:2024:01:27",
          entityType: "summary",
          content: entityContent,
          contentHash: computeContentHash(entityContent),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        await fileOps.writeEntity(entity);

        const expectedPath = join(
          testDir,
          "summary",
          "daily",
          "2024",
          "01",
          "27.md",
        );
        expect(existsSync(expectedPath)).toBe(true);

        const content = readFileSync(expectedPath, "utf-8");
        expect(content).toContain("daily:2024:01:27");
      });

      it("should create deeply nested directories", async () => {
        const entityContent = "Deeply nested";
        const entity = {
          id: "a:b:c:d:e:f",
          entityType: "test",
          content: entityContent,
          contentHash: computeContentHash(entityContent),
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        await fileOps.writeEntity(entity);

        const expectedPath = join(
          testDir,
          "test",
          "a",
          "b",
          "c",
          "d",
          "e",
          "f.md",
        );
        expect(existsSync(expectedPath)).toBe(true);
      });
    });

    describe("readEntity from subdirectories", () => {
      it("should read entities from nested paths", async () => {
        // First create the nested structure
        const subdir = join(testDir, "summary", "daily", "2024");
        mkdirSync(subdir, { recursive: true });

        const filePath = join(subdir, "01-27.md");
        writeFileSync(filePath, "# Test Summary\n\nContent here");

        // Read using relative path
        const entity = await fileOps.readEntity("summary/daily/2024/01-27.md");

        expect(entity.entityType).toBe("summary");
        expect(entity.id).toBe("daily:2024:01-27"); // Full ID reconstructed from path
        expect(entity.content).toContain("Test Summary");
      });

      it("should reconstruct entity ID from path with colons", async () => {
        // Create a file that was written with colon-based ID
        const subdir = join(testDir, "topic", "tech", "ai");
        mkdirSync(subdir, { recursive: true });

        const filePath = join(subdir, "llms.md");
        writeFileSync(filePath, "# AI Topic\n\nLLM content");

        const entity = await fileOps.readEntity("topic/tech/ai/llms.md");

        expect(entity.entityType).toBe("topic");
        // ID should be reconstructed from nested path
        expect(entity.id).toBe("tech:ai:llms");
      });
    });

    describe("getAllMarkdownFiles with subdirectories", () => {
      it("should find files in nested subdirectories", () => {
        // Create nested structure with files
        const paths = [
          join(testDir, "summary", "daily", "2024", "01-27.md"),
          join(testDir, "summary", "daily", "2024", "01-28.md"),
          join(testDir, "topic", "tech", "ai", "llms.md"),
          join(testDir, "note", "simple.md"),
        ];

        paths.forEach((path) => {
          mkdirSync(join(path, ".."), { recursive: true });
          writeFileSync(path, "test content");
        });

        const files = fileOps.getAllMarkdownFiles();

        expect(files).toContain("summary/daily/2024/01-27.md");
        expect(files).toContain("summary/daily/2024/01-28.md");
        expect(files).toContain("topic/tech/ai/llms.md");
        expect(files).toContain("note/simple.md");
        expect(files.length).toBe(4);
      });

      it("should handle mixed flat and nested files", () => {
        // Create mix of flat and nested files
        mkdirSync(join(testDir, "note"), { recursive: true });
        mkdirSync(join(testDir, "summary", "daily"), { recursive: true });

        writeFileSync(join(testDir, "note", "flat.md"), "flat");
        writeFileSync(join(testDir, "summary", "daily", "nested.md"), "nested");
        writeFileSync(join(testDir, "root.md"), "root");

        const files = fileOps.getAllMarkdownFiles();

        expect(files).toContain("root.md");
        expect(files).toContain("note/flat.md");
        expect(files).toContain("summary/daily/nested.md");
      });
    });
  });

  describe("Image File Support", () => {
    // Minimal 1x1 pixel PNG as binary
    const TINY_PNG_BYTES = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    const TINY_PNG_DATA_URL = `data:image/png;base64,${TINY_PNG_BYTES.toString("base64")}`;

    it("should read image files from image/ directory as base64 data URLs", async () => {
      // Create image file in image/ directory
      mkdirSync(join(testDir, "image"), { recursive: true });
      const imagePath = join(testDir, "image", "test-photo.png");
      writeFileSync(imagePath, TINY_PNG_BYTES);

      const entity = await fileOps.readEntity("image/test-photo.png");

      expect(entity.entityType).toBe("image");
      expect(entity.id).toBe("test-photo");
      expect(entity.content).toBe(TINY_PNG_DATA_URL);
    });

    it("should write image entities as binary files in image/ directory", async () => {
      const entity = {
        id: "my-image",
        entityType: "image",
        content: TINY_PNG_DATA_URL,
        contentHash: computeContentHash(TINY_PNG_DATA_URL),
        metadata: { format: "png" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await fileOps.writeEntity(entity);

      const expectedPath = join(testDir, "image", "my-image.png");
      expect(existsSync(expectedPath)).toBe(true);

      // Verify binary content
      const writtenBytes = readFileSync(expectedPath);
      expect(writtenBytes.equals(TINY_PNG_BYTES)).toBe(true);
    });

    it("should include image files from image/ directory in getAllSyncFiles", () => {
      // Create mix of markdown and image files
      mkdirSync(join(testDir, "note"), { recursive: true });
      mkdirSync(join(testDir, "image"), { recursive: true });

      writeFileSync(join(testDir, "note", "test.md"), "# Note");
      writeFileSync(join(testDir, "image", "photo.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "banner.jpg"), TINY_PNG_BYTES);

      const files = fileOps.getAllSyncFiles();

      expect(files).toContain("note/test.md");
      expect(files).toContain("image/photo.png");
      expect(files).toContain("image/banner.jpg");
    });

    it("should NOT include image files from non-image directories", () => {
      // Create image files in wrong directory
      mkdirSync(join(testDir, "note"), { recursive: true });

      writeFileSync(join(testDir, "note", "test.md"), "# Note");
      writeFileSync(join(testDir, "note", "photo.png"), TINY_PNG_BYTES); // Wrong!

      const files = fileOps.getAllSyncFiles();

      expect(files).toContain("note/test.md");
      expect(files).not.toContain("note/photo.png"); // Should be ignored
    });

    it("should handle different image formats in image/ directory", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });

      // Test various image extensions
      const extensions = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"];

      for (const ext of extensions) {
        const fileName = `test${ext}`;
        writeFileSync(join(testDir, "image", fileName), TINY_PNG_BYTES);

        const entity = await fileOps.readEntity(`image/${fileName}`);
        expect(entity.entityType).toBe("image");
        expect(entity.id).toBe("test");
      }
    });

    it("should use correct extension when writing image entities", async () => {
      const jpgEntity = {
        id: "photo",
        entityType: "image",
        content: "data:image/jpeg;base64," + TINY_PNG_BYTES.toString("base64"),
        contentHash: "abc",
        metadata: { format: "jpg" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await fileOps.writeEntity(jpgEntity);

      expect(existsSync(join(testDir, "image", "photo.jpg"))).toBe(true);
      expect(existsSync(join(testDir, "image", "photo.png"))).toBe(false);
    });

    it("should roundtrip image entities correctly", async () => {
      const entity = {
        id: "roundtrip-test",
        entityType: "image",
        content: TINY_PNG_DATA_URL,
        contentHash: computeContentHash(TINY_PNG_DATA_URL),
        metadata: { format: "png" },
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      // Write
      await fileOps.writeEntity(entity);

      // Read back
      const readEntity = await fileOps.readEntity("image/roundtrip-test.png");

      expect(readEntity.id).toBe("roundtrip-test");
      expect(readEntity.entityType).toBe("image");
      expect(readEntity.content).toBe(TINY_PNG_DATA_URL);
    });
  });

  describe("Windows Compatibility", () => {
    it("should not create files with colons in the filename", async () => {
      const entityContent = "test";
      const entity = {
        id: "summary:daily:2024-01-27",
        entityType: "summary",
        content: entityContent,
        contentHash: computeContentHash(entityContent),
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      await fileOps.writeEntity(entity);

      // Check that no file with colons exists
      const badPath = join(testDir, "summary", "summary:daily:2024-01-27.md");
      expect(existsSync(badPath)).toBe(false);

      // Check that the properly nested file exists
      const goodPath = join(testDir, "summary", "daily", "2024-01-27.md");
      expect(existsSync(goodPath)).toBe(true);
    });

    it("should handle Windows-style paths correctly", () => {
      const entityContent = "test";
      const entity = {
        id: "path:to:file",
        entityType: "note",
        content: entityContent,
        contentHash: computeContentHash(entityContent),
        metadata: {},
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      };

      const path = fileOps.getEntityFilePath(entity);

      // Should use proper path separator for the platform
      // and not have colons in filename
      expect(path).not.toContain("path:to:file.md");
      expect(path).toContain(join("note", "path", "to", "file.md"));
    });
  });
});
