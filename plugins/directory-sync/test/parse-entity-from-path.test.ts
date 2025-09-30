import { describe, it, expect, beforeEach } from "bun:test";
import { FileOperations } from "../src/lib/file-operations";
import type { IEntityService } from "@brains/plugins";
import { join } from "path";

describe("FileOperations.parseEntityFromPath", () => {
  let fileOps: FileOperations;
  const testDir = "/test/brain-data";

  beforeEach(() => {
    const mockEntityService = {
      serializeEntity: (entity: { id: string; content: string }) => `# ${entity.id}\n\n${entity.content}`,
      deserializeEntity: () => ({ metadata: {} }),
    } as unknown as IEntityService;

    fileOps = new FileOperations(testDir, mockEntityService);
  });

  describe("root level files", () => {
    it("should parse simple root level file as base entity", () => {
      const result = fileOps.parseEntityFromPath("/test/brain-data/my-note.md");
      expect(result).toEqual({
        entityType: "base",
        id: "my-note",
      });
    });

    it("should handle root file with relative path", () => {
      const result = fileOps.parseEntityFromPath("my-note.md");
      expect(result).toEqual({
        entityType: "base",
        id: "my-note",
      });
    });
  });

  describe("entity type directories", () => {
    it("should parse entity type from first directory", () => {
      const result = fileOps.parseEntityFromPath("/test/brain-data/summary/daily.md");
      expect(result).toEqual({
        entityType: "summary",
        id: "daily",
      });
    });

    it("should handle nested paths with colons", () => {
      const result = fileOps.parseEntityFromPath("/test/brain-data/site-content/landing/hero.md");
      expect(result).toEqual({
        entityType: "site-content",
        id: "landing:hero",
      });
    });

    it("should handle deeply nested paths", () => {
      const result = fileOps.parseEntityFromPath("/test/brain-data/site-content/products/category/item.md");
      expect(result).toEqual({
        entityType: "site-content",
        id: "products:category:item",
      });
    });
  });

  describe("edge cases", () => {
    it("should handle paths without .md extension in directory names", () => {
      const result = fileOps.parseEntityFromPath("/test/brain-data/test.md/actual-file.md");
      expect(result).toEqual({
        entityType: "test.md",
        id: "actual-file",
      });
    });

    it("should handle relative nested paths", () => {
      const result = fileOps.parseEntityFromPath("topic/technology/ai.md");
      expect(result).toEqual({
        entityType: "topic",
        id: "technology:ai",
      });
    });
  });

  describe("roundtrip with getFilePath", () => {
    it("should reconstruct path correctly for simple entity", () => {
      const originalPath = join(testDir, "summary/daily.md");
      const parsed = fileOps.parseEntityFromPath(originalPath);
      const reconstructed = fileOps.getFilePath(parsed.id, parsed.entityType);
      expect(reconstructed).toBe(originalPath);
    });

    it("should reconstruct path correctly for nested entity", () => {
      const originalPath = join(testDir, "site-content/landing/hero.md");
      const parsed = fileOps.parseEntityFromPath(originalPath);
      const reconstructed = fileOps.getFilePath(parsed.id, parsed.entityType);
      expect(reconstructed).toBe(originalPath);
    });
  });
});