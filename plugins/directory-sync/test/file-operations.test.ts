import { describe, it, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { FileOperations } from "../src/lib/file-operations";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
  mkdtempSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseAssetRef, type BaseEntity } from "@brains/plugins";
import type { FileOperationsEntityService } from "../src/lib/file-operations";
import {
  createMockAssetsNamespace,
  createTestEntity,
} from "@brains/test-utils";
import {
  TINY_PDF_BYTES,
  TINY_PDF_DATA_URL,
  TINY_PNG_BYTES,
  TINY_PNG_DATA_URL,
} from "./fixtures";

describe("FileOperations", () => {
  let fileOps: FileOperations;
  let testDir: string;
  let mockEntityService: FileOperationsEntityService;
  let assets: ReturnType<typeof createMockAssetsNamespace>;

  beforeEach(() => {
    // Create a unique test directory
    testDir = mkdtempSync(join(tmpdir(), "test-file-ops-"));

    assets = createMockAssetsNamespace();
    mockEntityService = {
      serializeEntity: (entity: BaseEntity): string =>
        `# ${entity.id}\n\n${entity.content}`,
      hasEntityType: (): boolean => true,
      getEntityTypeConfig: (entityType: string): { binaryStorage?: "asset" } =>
        entityType === "image" ? { binaryStorage: "asset" } : {},
      getEntity: async (): Promise<null> => null,
    };

    fileOps = new FileOperations(testDir, mockEntityService, assets);
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

      it("should handle note entities without subdirectories", () => {
        const content = "test";
        const entity = createTestEntity("note", {
          id: "note:entity:test",
          content,
          metadata: {},
        });

        // Note entities go in root, "note:" prefix is stripped since it matches entity type
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
      it("enforces the ordinary import limit independently of asset imports", async () => {
        mkdirSync(join(testDir, "topic"), { recursive: true });
        writeFileSync(join(testDir, "topic", "bounded.md"), "text");
        const exactFileOps = new FileOperations(
          testDir,
          mockEntityService,
          assets,
          { maxImportFileBytes: 4, maxAssetImportBytes: 1 },
        );
        const oversizedFileOps = new FileOperations(
          testDir,
          mockEntityService,
          assets,
          { maxImportFileBytes: 3, maxAssetImportBytes: 100 },
        );

        expect(
          (await exactFileOps.readEntity("topic/bounded.md")).content,
        ).toBe("text");
        expect(oversizedFileOps.readEntity("topic/bounded.md")).rejects.toThrow(
          "exceeds ordinary import limit",
        );
      });

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
      it("should find files in nested subdirectories", async () => {
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

        const files = await fileOps.getAllMarkdownFiles();

        expect(files).toContain("summary/daily/2024/01-27.md");
        expect(files).toContain("summary/daily/2024/01-28.md");
        expect(files).toContain("topic/tech/ai/llms.md");
        expect(files).toContain("link/simple.md");
        expect(files.length).toBe(4);
      });

      it("should handle mixed flat and nested files", async () => {
        // Create mix of flat and nested files
        mkdirSync(join(testDir, "topic"), { recursive: true });
        mkdirSync(join(testDir, "summary", "daily"), { recursive: true });

        writeFileSync(join(testDir, "topic", "flat.md"), "flat");
        writeFileSync(join(testDir, "summary", "daily", "nested.md"), "nested");
        writeFileSync(join(testDir, "root.md"), "root");

        const files = await fileOps.getAllMarkdownFiles();

        expect(files).toContain("root.md");
        expect(files).toContain("topic/flat.md");
        expect(files).toContain("summary/daily/nested.md");
      });

      it("should skip root directories that are not registered entity types", async () => {
        const selectiveService: FileOperationsEntityService = {
          serializeEntity: () => "",
          hasEntityType: (type: string) => ["post", "link"].includes(type),
          getEntityTypeConfig: (): Record<string, never> => ({}),
          getEntity: async (): Promise<null> => null,
        };
        const selectiveFileOps = new FileOperations(
          testDir,
          selectiveService,
          assets,
        );

        mkdirSync(join(testDir, "post"), { recursive: true });
        mkdirSync(join(testDir, "link"), { recursive: true });
        mkdirSync(join(testDir, "templates"), { recursive: true });

        writeFileSync(join(testDir, "post", "hello.md"), "post");
        writeFileSync(join(testDir, "link", "ref.md"), "link");
        writeFileSync(join(testDir, "templates", "post.md"), "template");
        writeFileSync(join(testDir, "root.md"), "root");

        const files = await selectiveFileOps.getAllMarkdownFiles();

        expect(files).toContain("post/hello.md");
        expect(files).toContain("link/ref.md");
        expect(files).toContain("root.md");
        expect(files).not.toContain("templates/post.md");
      });
    });
  });

  describe("Image File Support", () => {
    it("streams image files into durable assets and returns canonical metadata", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      const imagePath = join(testDir, "image", "test-photo.png");
      writeFileSync(imagePath, TINY_PNG_BYTES);

      const entity = await fileOps.readEntity("image/test-photo.png");
      const ref = parseAssetRef(entity.content);

      expect(entity.entityType).toBe("image");
      expect(entity.id).toBe("test-photo");
      expect(await assets.read(ref)).toEqual(TINY_PNG_BYTES);
      expect(entity.metadata).toEqual({
        format: "png",
        mediaType: "image/png",
        sizeBytes: TINY_PNG_BYTES.byteLength,
        width: 1,
        height: 1,
      });
    });

    it("uses the independent streamed asset import limit", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "bounded.png"), TINY_PNG_BYTES);
      const putStream = spyOn(assets, "putStream");
      const boundedFileOps = new FileOperations(
        testDir,
        mockEntityService,
        assets,
        {
          maxImportFileBytes: 1,
          maxAssetImportBytes: TINY_PNG_BYTES.byteLength,
        },
      );

      await boundedFileOps.readEntity("image/bounded.png");

      expect(putStream).toHaveBeenCalledTimes(1);
      expect(putStream.mock.calls[0]?.[1]).toEqual({
        expectedSize: TINY_PNG_BYTES.byteLength,
        maxBytes: TINY_PNG_BYTES.byteLength,
      });
    });

    it("rejects an oversized image before writing an asset", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "oversized.png"), TINY_PNG_BYTES);
      const putStream = spyOn(assets, "putStream");
      const boundedFileOps = new FileOperations(
        testDir,
        mockEntityService,
        assets,
        {
          maxImportFileBytes: TINY_PNG_BYTES.byteLength,
          maxAssetImportBytes: TINY_PNG_BYTES.byteLength - 1,
        },
      );

      expect(boundedFileOps.readEntity("image/oversized.png")).rejects.toThrow(
        "exceeds asset import limit",
      );
      expect(putStream).not.toHaveBeenCalled();
    });

    it("should write asset-backed image entities as binary files", async () => {
      const stored = assets.store.seed(TINY_PNG_BYTES);
      const entity = createTestEntity("image", {
        id: "my-image",
        content: stored.ref,
        metadata: {
          format: "png",
          mediaType: "image/png",
          sizeBytes: stored.sizeBytes,
          width: 1,
          height: 1,
        },
      });

      await fileOps.writeEntity(entity);

      const expectedPath = join(testDir, "image", "my-image.png");
      expect(existsSync(expectedPath)).toBe(true);
      expect(readFileSync(expectedPath).equals(TINY_PNG_BYTES)).toBe(true);
    });

    it("fails loudly without replacing a file when an image asset is missing", async () => {
      const imageDir = join(testDir, "image");
      const imagePath = join(imageDir, "guarded.png");
      mkdirSync(imageDir, { recursive: true });
      writeFileSync(imagePath, TINY_PNG_BYTES);
      const entity = createTestEntity("image", {
        id: "guarded",
        content: `asset://sha256/${"a".repeat(64)}`,
        metadata: {
          format: "png",
          mediaType: "image/png",
          sizeBytes: TINY_PNG_BYTES.byteLength,
          width: 1,
          height: 1,
        },
      });

      expect(fileOps.writeEntity(entity)).rejects.toThrow(
        "Mock asset not found",
      );
      expect(readFileSync(imagePath).equals(TINY_PNG_BYTES)).toBe(true);
    });

    it("should include image files from image/ directory in getAllSyncFiles", async () => {
      // Create mix of markdown and image files
      mkdirSync(join(testDir, "topic"), { recursive: true });
      mkdirSync(join(testDir, "image"), { recursive: true });

      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "image", "photo.png"), TINY_PNG_BYTES);
      writeFileSync(join(testDir, "image", "banner.jpg"), TINY_PNG_BYTES);

      const files = await fileOps.getAllSyncFiles();

      expect(files).toContain("topic/test.md");
      expect(files).toContain("image/photo.png");
      expect(files).toContain("image/banner.jpg");
    });

    it("should NOT include image files from non-image directories", async () => {
      // Create image files in wrong directory
      mkdirSync(join(testDir, "topic"), { recursive: true });

      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "topic", "photo.png"), TINY_PNG_BYTES); // Wrong!

      const files = await fileOps.getAllSyncFiles();

      expect(files).toContain("topic/test.md");
      expect(files).not.toContain("topic/photo.png"); // Should be ignored
    });

    it("does not treat SVG files as durable images", async () => {
      mkdirSync(join(testDir, "image"), { recursive: true });
      writeFileSync(join(testDir, "image", "unsafe.svg"), "<svg />");

      const files = await fileOps.getAllSyncFiles();

      expect(files).not.toContain("image/unsafe.svg");
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

    it("should roundtrip asset-backed image entities correctly", async () => {
      const stored = assets.store.seed(TINY_PNG_BYTES);
      const entity = createTestEntity("image", {
        id: "roundtrip-test",
        content: stored.ref,
        metadata: {
          format: "png",
          mediaType: "image/png",
          sizeBytes: stored.sizeBytes,
          width: 1,
          height: 1,
        },
      });

      await fileOps.writeEntity(entity);
      const readEntity = await fileOps.readEntity("image/roundtrip-test.png");

      expect(readEntity.id).toBe("roundtrip-test");
      expect(readEntity.entityType).toBe("image");
      expect(readEntity.content).toBe(stored.ref);
    });
  });

  describe("Document File Support", () => {
    it("should read PDF files from document/ directory as base64 data URLs", async () => {
      mkdirSync(join(testDir, "document"), { recursive: true });
      const documentPath = join(testDir, "document", "carousel.pdf");
      writeFileSync(documentPath, TINY_PDF_BYTES);

      const entity = await fileOps.readEntity("document/carousel.pdf");

      expect(entity.entityType).toBe("document");
      expect(entity.id).toBe("carousel");
      expect(entity.content).toBe(TINY_PDF_DATA_URL);
    });

    it("should write document entities as binary PDF files in document/ directory", async () => {
      const entity = createTestEntity("document", {
        id: "carousel",
        content: TINY_PDF_DATA_URL,
        metadata: { mimeType: "application/pdf", filename: "carousel.pdf" },
      });

      await fileOps.writeEntity(entity);

      const expectedPath = join(testDir, "document", "carousel.pdf");
      expect(existsSync(expectedPath)).toBe(true);
      expect(existsSync(join(testDir, "document", "carousel.md"))).toBe(false);

      const writtenBytes = readFileSync(expectedPath);
      expect(writtenBytes.equals(TINY_PDF_BYTES)).toBe(true);
    });

    it("fails loudly instead of decoding a document asset reference as base64", async () => {
      const documentDir = join(testDir, "document");
      const documentPath = join(documentDir, "guarded.pdf");
      mkdirSync(documentDir, { recursive: true });
      writeFileSync(documentPath, TINY_PDF_BYTES);
      const entity = createTestEntity("document", {
        id: "guarded",
        content: `asset://sha256/${"b".repeat(64)}`,
        metadata: { mimeType: "application/pdf", filename: "guarded.pdf" },
      });

      let writeError: unknown;
      try {
        await fileOps.writeEntity(entity);
      } catch (error) {
        writeError = error;
      }
      expect(writeError).toHaveProperty(
        "message",
        expect.stringContaining("expected a supported base64 data URL"),
      );
      expect(readFileSync(documentPath).equals(TINY_PDF_BYTES)).toBe(true);
    });

    it("should include PDF files from document/ directory in getAllSyncFiles", async () => {
      mkdirSync(join(testDir, "topic"), { recursive: true });
      mkdirSync(join(testDir, "document"), { recursive: true });

      writeFileSync(join(testDir, "topic", "test.md"), "# Topic");
      writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);

      const files = await fileOps.getAllSyncFiles();

      expect(files).toContain("topic/test.md");
      expect(files).toContain("document/carousel.pdf");
    });

    it("should roundtrip document entities correctly", async () => {
      const entity = createTestEntity("document", {
        id: "roundtrip-carousel",
        content: TINY_PDF_DATA_URL,
        metadata: { mimeType: "application/pdf", filename: "carousel.pdf" },
      });

      await fileOps.writeEntity(entity);

      const readEntity = await fileOps.readEntity(
        "document/roundtrip-carousel.pdf",
      );

      expect(readEntity.id).toBe("roundtrip-carousel");
      expect(readEntity.entityType).toBe("document");
      expect(readEntity.content).toBe(TINY_PDF_DATA_URL);
    });

    it("should persist document metadata in a sidecar JSON file", async () => {
      const entity = createTestEntity("document", {
        id: "carousel-with-metadata",
        content: TINY_PDF_DATA_URL,
        metadata: {
          mimeType: "application/pdf",
          filename: "carousel.pdf",
          pageCount: 3,
          dedupKey: "carousel:post-1",
        },
      });

      await fileOps.writeEntity(entity);

      const sidecarPath = join(
        testDir,
        "document",
        "carousel-with-metadata.pdf.meta.json",
      );
      expect(existsSync(sidecarPath)).toBe(true);

      const sidecar = JSON.parse(readFileSync(sidecarPath, "utf-8"));
      expect(sidecar).toEqual({
        filename: "carousel.pdf",
        pageCount: 3,
        dedupKey: "carousel:post-1",
      });
    });

    it("should read document sidecar metadata with a path-derived filename fallback", async () => {
      mkdirSync(join(testDir, "document"), { recursive: true });
      writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);
      writeFileSync(
        join(testDir, "document", "carousel.pdf.meta.json"),
        JSON.stringify({ pageCount: 3, dedupKey: "carousel:post-1" }),
      );

      const entity = await fileOps.readEntity("document/carousel.pdf");

      expect(entity.metadata).toEqual({
        mimeType: "application/pdf",
        filename: "carousel.pdf",
        pageCount: 3,
        dedupKey: "carousel:post-1",
      });
    });

    it("should round-trip the full document metadata via write+read", async () => {
      const entity = createTestEntity("document", {
        id: "full-roundtrip",
        content: TINY_PDF_DATA_URL,
        metadata: {
          mimeType: "application/pdf",
          filename: "original-name.pdf",
          pageCount: 7,
          sourceEntityType: "social-post",
          sourceEntityId: "post-1",
          attachmentType: "carousel",
          dedupKey: "carousel-template:social-post:post-1:abc",
        },
      });

      await fileOps.writeEntity(entity);
      const readEntity = await fileOps.readEntity(
        "document/full-roundtrip.pdf",
      );

      expect(readEntity.metadata).toEqual({
        mimeType: "application/pdf",
        filename: "original-name.pdf",
        pageCount: 7,
        sourceEntityType: "social-post",
        sourceEntityId: "post-1",
        attachmentType: "carousel",
        dedupKey: "carousel-template:social-post:post-1:abc",
      });
    });

    it("should default mimeType and filename when no sidecar exists", async () => {
      mkdirSync(join(testDir, "document"), { recursive: true });
      writeFileSync(
        join(testDir, "document", "hand-placed.pdf"),
        TINY_PDF_BYTES,
      );

      const entity = await fileOps.readEntity("document/hand-placed.pdf");

      expect(entity.metadata).toEqual({
        mimeType: "application/pdf",
        filename: "hand-placed.pdf",
      });
    });

    it("should exclude sidecar JSON files from sync file discovery", async () => {
      mkdirSync(join(testDir, "document"), { recursive: true });
      writeFileSync(join(testDir, "document", "carousel.pdf"), TINY_PDF_BYTES);
      writeFileSync(
        join(testDir, "document", "carousel.pdf.meta.json"),
        JSON.stringify({ filename: "carousel.pdf" }),
      );

      const files = await fileOps.getAllSyncFiles();

      expect(files).toContain("document/carousel.pdf");
      expect(files).not.toContain("document/carousel.pdf.meta.json");
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
