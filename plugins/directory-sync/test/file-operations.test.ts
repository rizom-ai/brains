import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { FileOperations } from "../src/lib/file-operations";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import type { IEntityService, BaseEntity } from "@brains/plugins";

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
      const entity = {
        id: "landing:hero",
        entityType: "site-content",
        content: "# Hero Section",
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
        const entity = {
          id: "simple-id",
          entityType: "note",
          content: "test",
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "note", "simple-id.md"));
      });

      it("should map entity IDs with colons to subdirectories", () => {
        const entity = {
          id: "daily:2024-01-27",
          entityType: "summary",
          content: "test",
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "summary", "daily", "2024-01-27.md"));
      });

      it("should handle multiple colons creating nested directories", () => {
        const entity = {
          id: "tech:ai:llms:gpt4",
          entityType: "topic",
          content: "test",
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
        const entity = {
          id: "base:entity:test",
          entityType: "base",
          content: "test",
          metadata: {},
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };

        // Base entities go in root, "base:" prefix is stripped since it matches entity type
        const path = fileOps.getEntityFilePath(entity);
        expect(path).toBe(join(testDir, "entity", "test.md"));
      });

      it("should handle empty ID parts gracefully", () => {
        const entity = {
          id: "summary::2024", // Double colon
          entityType: "summary",
          content: "test",
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
        const entity = {
          id: "daily:2024:01:27",
          entityType: "summary",
          content: "Daily summary content",
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
        const entity = {
          id: "a:b:c:d:e:f",
          entityType: "test",
          content: "Deeply nested",
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

  describe("Windows Compatibility", () => {
    it("should not create files with colons in the filename", async () => {
      const entity = {
        id: "summary:daily:2024-01-27",
        entityType: "summary",
        content: "test",
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
      const entity = {
        id: "path:to:file",
        entityType: "note",
        content: "test",
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
