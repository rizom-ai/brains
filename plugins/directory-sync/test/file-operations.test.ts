import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { FileOperations } from "../src/lib/file-operations";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";
import { TINY_PNG_BYTES, TINY_PNG_DATA_URL } from "./fixtures";

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
      mkdirSync(join(testDir, "topic"), { recursive: true });
      writeFileSync(join(testDir, "topic", "simple.md"), "# Topic");

      const entity = await fileOps.readEntity("topic/simple.md");

      expect(entity.entityType).toBe("topic");
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
      const entity = createTestEntity("site-content", {
        id: "landing:hero",
        content: entityContent,
        metadata: {},
      });

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
        const entity = createTestEntity("topic", {
          id: "simple-id",
          content: testContent,
          metadata: {},
        });

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "topic", "simple-id.md"));
      });

      it("should map entity IDs with colons to subdirectories", () => {
        const content = "test";
        const entity = createTestEntity("summary", {
          id: "daily:2024-01-27",
          content,
          metadata: {},
        });

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "summary", "daily", "2024-01-27.md"));
      });

      it("should handle multiple colons creating nested directories", () => {
        const content = "test";
        const entity = createTestEntity("topic", {
          id: "tech:ai:llms:gpt4",
          content,
          metadata: {},
        });

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(
          join(testDir, "topic", "tech", "ai", "llms", "gpt4.md"),
        );
      });

      it("should handle base entities without subdirectories", () => {
        const content = "test";
        const entity = createTestEntity("base", {
          id: "base:entity:test",
          content,
          metadata: {},
        });

        // Base entities go in root, "base:" prefix is stripped since it matches entity type
        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "entity", "test.md"));
      });

      it("should handle empty ID parts gracefully", () => {
        const content = "test";
        const entity = createTestEntity("summary", {
          id: "summary::2024", // Double colon
          content,
          metadata: {},
        });

        const path = fileOps.getEntityFilePath(entity);
        // Should skip empty parts
        expect(path).toBe(join(testDir, "summary", "2024.md"));
      });
    });

    describe("writeEntity with subdirectories", () => {
      it("should create necessary subdirectories when writing", async () => {
        const entityContent = "Daily summary content";
        const entity = createTestEntity("summary", {
          id: "daily:2024:01:27",
          content: entityContent,
          metadata: {},
        });

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
        const entity = createTestEntity("test", {
          id: "a:b:c:d:e:f",
          content: entityContent,
          metadata: {},
        });

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
          join(testDir, "link", "simple.md"),
        ];

        paths.forEach((path) => {
          mkdirSync(join(path, ".."), { recursive: true });
          writeFileSync(path, "test content");
        });

        const files = fileOps.getAllMarkdownFiles();

        expect(files).toContain("summary/daily/2024/01-27.md");
        expect(files).toContain("summary/daily/2024/01-28.md");
        expect(files).toContain("topic/tech/ai/llms.md");
        expect(files).toContain("link/simple.md");
        expect(files.length).toBe(4);
      });

      it("should handle mixed flat and nested files", () => {
        // Create mix of flat and nested files
        mkdirSync(join(testDir, "topic"), { recursive: true });
        mkdirSync(join(testDir, "summary", "daily"), { recursive: true });

        writeFileSync(join(testDir, "topic", "flat.md"), "flat");
        writeFileSync(join(testDir, "summary", "daily", "nested.md"), "nested");
        writeFileSync(join(testDir, "root.md"), "root");

        const files = fileOps.getAllMarkdownFiles();

        expect(files).toContain("root.md");
        expect(files).toContain("topic/flat.md");
        expect(files).toContain("summary/daily/nested.md");
      });
    });
  });

  describe("Image File Support", () => {
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
      const entity = createTestEntity("image", {
        id: "my-image",
        content: TINY_PNG_DATA_URL,
        metadata: { format: "png" },
      });

      await fileOps.writeEntity(entity);

      const expectedPath = join(testDir, "image", "my-image.png");
      expect(existsSync(expectedPath)).toBe(true);

      // Verify binary content
      const writtenBytes = readFileSync(expectedPath);
      expect(writtenBytes.equals(TINY_PNG_BYTES)).toBe(true);
    });

    it("should include image files from image/ directory in getAllSyncFiles", () => {
      // Create mix of markdown and image files
      mkdirSync(join(testDir, "topic"), { recursive: true });
      mkdirSync(join(testDir, "image"), { recursive: true });

      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "image", "photo.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "banner.jpg"), TINY_PNG_BYTES);

      const files = fileOps.getAllSyncFiles();

      expect(files).toContain("topic/test.md");
      expect(files).toContain("image/photo.png");
      expect(files).toContain("image/banner.jpg");
    });

    it("should NOT include image files from non-image directories", () => {
      // Create image files in wrong directory
      mkdirSync(join(testDir, "topic"), { recursive: true });

      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "topic", "photo.png"), TINY_PNG_BYTES); // Wrong!

      const files = fileOps.getAllSyncFiles();

      expect(files).toContain("topic/test.md");
      expect(files).not.toContain("topic/photo.png"); // Should be ignored
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
      const jpgEntity = createTestEntity("image", {
        id: "photo",
        content: "data:image/jpeg;base64," + TINY_PNG_BYTES.toString("base64"),
        metadata: { format: "jpg" },
      });

      await fileOps.writeEntity(jpgEntity);

      expect(existsSync(join(testDir, "image", "photo.jpg"))).toBe(true);
      expect(existsSync(join(testDir, "image", "photo.png"))).toBe(false);
    });

    it("should roundtrip image entities correctly", async () => {
      const entity = createTestEntity("image", {
        id: "roundtrip-test",
        content: TINY_PNG_DATA_URL,
        metadata: { format: "png" },
      });

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
      const entity = createTestEntity("summary", {
        id: "summary:daily:2024-01-27",
        content: entityContent,
        metadata: {},
      });

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
      const entity = createTestEntity("topic", {
        id: "path:to:file",
        content: entityContent,
        metadata: {},
      });

      const path = fileOps.getEntityFilePath(entity);

      // Should use proper path separator for the platform
      // and not have colons in filename
      expect(path).not.toContain("path:to:file.md");
      expect(path).toContain(join("topic", "path", "to", "file.md"));
    });
  });

  describe("Stale Content Protection", () => {
    it("should skip write when serialized content matches file content", async () => {
      // Setup: Create a file with specific content
      mkdirSync(join(testDir, "topic"), { recursive: true });
      const filePath = join(testDir, "topic", "test-topic.md");

      // The mock serializeEntity returns "# {id}\n\n{content}"
      // So for id="test-topic" and content="Same content", it produces:
      const expectedSerializedContent = "# test-topic\n\nSame content";
      writeFileSync(filePath, expectedSerializedContent);

      // Create entity that will serialize to the SAME content
      const entity = createTestEntity("topic", {
        id: "test-topic",
        content: "Same content",
        metadata: {},
      });

      // Get file mtime before write attempt
      const mtimeBefore = statSync(filePath).mtime.getTime();

      // Small delay to ensure mtime would change if file is written
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to write
      await fileOps.writeEntity(entity);

      // Verify file was NOT modified (mtime unchanged)
      const mtimeAfter = statSync(filePath).mtime.getTime();
      expect(mtimeAfter).toBe(mtimeBefore);

      // Content should remain the same
      const actualContent = readFileSync(filePath, "utf-8");
      expect(actualContent).toBe(expectedSerializedContent);
    });

    it("should write when serialized content differs from file content", async () => {
      // Setup: Create a file with OLD content
      mkdirSync(join(testDir, "topic"), { recursive: true });
      const filePath = join(testDir, "topic", "test-topic.md");
      writeFileSync(filePath, "# test-topic\n\nOld content");

      // Create entity with DIFFERENT content
      const entity = createTestEntity("topic", {
        id: "test-topic",
        content: "New content",
        metadata: {},
      });

      await fileOps.writeEntity(entity);

      // Verify file WAS updated
      const actualContent = readFileSync(filePath, "utf-8");
      expect(actualContent).toBe("# test-topic\n\nNew content");
    });

    it("should write when file does not exist", async () => {
      const filePath = join(testDir, "topic", "new-topic.md");
      expect(existsSync(filePath)).toBe(false);

      const entity = createTestEntity("topic", {
        id: "new-topic",
        content: "Brand new content",
        metadata: {},
      });

      await fileOps.writeEntity(entity);

      // Verify file was created
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf-8");
      expect(content).toBe("# new-topic\n\nBrand new content");
    });

    it("should skip write for image when content matches", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      const filePath = join(testDir, "image", "test-image.png");
      writeFileSync(filePath, TINY_PNG_BYTES);

      const mtimeBefore = statSync(filePath).mtime.getTime();
      await new Promise((resolve) => setTimeout(resolve, 10));

      const entity = createTestEntity("image", {
        id: "test-image",
        content: TINY_PNG_DATA_URL,
        metadata: { format: "png" },
      });

      await fileOps.writeEntity(entity);

      // Verify file was NOT modified
      const mtimeAfter = statSync(filePath).mtime.getTime();
      expect(mtimeAfter).toBe(mtimeBefore);
    });

    it("should write image when content differs", async () => {
      // Use a different 1x1 PNG (grayscale) as the "old" content
      const oldImageBytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      );

      mkdirSync(join(testDir, "image"), { recursive: true });
      const filePath = join(testDir, "image", "test-image.png");
      writeFileSync(filePath, oldImageBytes);

      const entity = createTestEntity("image", {
        id: "test-image",
        content: TINY_PNG_DATA_URL,
        metadata: { format: "png" },
      });

      await fileOps.writeEntity(entity);

      const actualBytes = readFileSync(filePath);
      expect(actualBytes.equals(TINY_PNG_BYTES)).toBe(true);
    });
  });
});
