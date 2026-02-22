import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
  createMockEntityService,
  createMockProgressReporter,
  createTestEntity,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectoryImportJobHandler", () => {
  let handler: DirectoryImportJobHandler;

  beforeEach(() => {
    const mockContext = createMockServicePluginContext({
      returns: {
        entityService: {
          getEntity: null,
          createEntity: { entityId: "test" },
          updateEntity: { entityId: "test" },
        },
      },
    });

    handler = new DirectoryImportJobHandler(
      createSilentLogger("test"),
      mockContext,
      createMockDirectorySync(),
    );
  });

  describe("validateAndParse", () => {
    it("should validate empty object (all fields optional)", () => {
      const result = handler.validateAndParse({});
      expect(result).not.toBeNull();
      // batchSize is optional, defaults applied in process()
      expect(result?.batchSize).toBeUndefined();
    });

    it("should validate with paths array", () => {
      const data = { paths: ["/path/to/file1.md", "/path/to/file2.md"] };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.paths).toEqual(["/path/to/file1.md", "/path/to/file2.md"]);
    });

    it("should validate with custom batchSize", () => {
      const data = { batchSize: 50 };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.batchSize).toBe(50);
    });

    it("should validate with batchIndex", () => {
      const data = { batchIndex: 2 };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.batchIndex).toBe(2);
    });

    it("should return null for invalid batchSize", () => {
      const result = handler.validateAndParse({ batchSize: 0 });
      expect(result).toBeNull();
    });

    it("should return null for invalid paths type", () => {
      const result = handler.validateAndParse({ paths: "not-an-array" });
      expect(result).toBeNull();
    });
  });

  describe("content hash comparison (regression)", () => {
    it("should update entity when content differs even if mtime is not newer", async () => {
      // This is a regression test for the bug where coverImageId was stripped
      // because import only compared mtime, not content hash

      const oldContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      const newContent = `---
coverImageId: series-test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      const existingEntity = createTestEntity("series", {
        id: "series-test-series",
        content: oldContent,
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T12:00:00.000Z", // Same or newer than file mtime
        metadata: { name: "Test Series", slug: "test-series" },
      });

      // File has OLDER mtime but DIFFERENT content
      const fileEntity = {
        id: "series-test-series",
        entityType: "series",
        content: newContent,
        created: new Date("2025-01-01T10:00:00.000Z"),
        updated: new Date("2025-01-01T11:00:00.000Z"), // OLDER than entity.updated
      };

      // Create entity service with proper mocks via createMockEntityService
      const mockEntityService = createMockEntityService({
        entityTypes: ["series", "note", "post"],
        returns: {
          getEntity: existingEntity,
          createEntity: { entityId: "test", jobId: "job-1" },
          updateEntity: { entityId: "series-test-series", jobId: "job-1" },
        },
      });
      spyOn(mockEntityService, "deserializeEntity").mockReturnValue({
        content: newContent,
        entityType: "series",
        metadata: { name: "Test Series", slug: "test-series" },
      });

      const mockContext = createMockServicePluginContext({
        entityService: mockEntityService,
      });

      const mockDirSync = createMockDirectorySync({
        getAllMarkdownFiles: mock(() => ["/path/to/series.md"]),
        fileOps: {
          readEntity: mock(() => Promise.resolve(fileEntity)),
          parseEntityFromPath: mock(() => ({
            entityType: "series",
            id: "series-test-series",
          })),
        },
      });

      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        mockContext,
        mockDirSync,
      );

      const mockProgressReporter = createMockProgressReporter();

      const result = await testHandler.process(
        { paths: ["/path/to/series.md"] },
        "test-job",
        mockProgressReporter,
      );

      // EXPECTED: Entity should be updated because content hash differs
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(mockEntityService.updateEntity).toHaveBeenCalled();
    });
  });
});
