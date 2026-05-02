import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
  createMockProgressReporter,
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

  describe("process", () => {
    it("should delegate to DirectorySync import pipeline with progress", async () => {
      const importWithProgress = mock(() =>
        Promise.resolve({
          imported: 1,
          skipped: 0,
          failed: 0,
          quarantined: 0,
          quarantinedFiles: [],
          errors: [],
          jobIds: ["job-1"],
        }),
      );
      const mockDirSync = createMockDirectorySync({
        importEntitiesWithProgress: importWithProgress,
      });
      const mockContext = createMockServicePluginContext();
      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        mockContext,
        mockDirSync,
      );
      const reporter = createMockProgressReporter();

      const result = await testHandler.process(
        { paths: ["/path/to/series.md"], batchSize: 25 },
        "test-job",
        reporter,
      );

      expect(result.imported).toBe(1);
      expect(importWithProgress).toHaveBeenCalledWith(
        ["/path/to/series.md"],
        reporter,
        25,
      );
    });
  });
});
