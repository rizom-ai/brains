import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import type { IDirectorySync } from "../../src/types";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("DirectoryImportJobHandler", () => {
  let handler: DirectoryImportJobHandler;
  let mockDirectorySync: IDirectorySync;

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

    mockDirectorySync = {
      getAllMarkdownFiles: mock(() => []),
      fileOps: {
        readEntity: mock(() =>
          Promise.resolve({
            entityType: "note",
            id: "test",
            content: "test",
            created: new Date(),
            updated: new Date(),
          }),
        ),
      },
      importEntitiesWithProgress: mock(() =>
        Promise.resolve({
          imported: 0,
          skipped: 0,
          failed: 0,
          quarantined: 0,
          quarantinedFiles: [],
          errors: [],
          jobIds: [],
        }),
      ),
      exportEntitiesWithProgress: mock(() =>
        Promise.resolve({ exported: 0, failed: 0, errors: [] }),
      ),
      processEntityExport: mock(() => Promise.resolve({ success: true })),
    };

    handler = new DirectoryImportJobHandler(
      createSilentLogger("test"),
      mockContext,
      mockDirectorySync,
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
});
