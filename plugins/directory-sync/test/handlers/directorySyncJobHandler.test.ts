import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectorySyncJobHandler } from "../../src/handlers/directorySyncJobHandler";
import type { IDirectorySync } from "../../src/types";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("DirectorySyncJobHandler", () => {
  let handler: DirectorySyncJobHandler;
  let mockDirectorySync: IDirectorySync;

  beforeEach(() => {
    const mockContext = createMockServicePluginContext();

    mockDirectorySync = {
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
      getAllMarkdownFiles: mock(() => []),
      processEntityExport: mock(() => Promise.resolve({ success: true })),
      fileOps: {
        readEntity: mock(() => Promise.resolve({} as never)),
        parseEntityFromPath: mock(() => ({ entityType: "note", id: "test" })),
      },
    };

    handler = new DirectorySyncJobHandler(
      createSilentLogger("test"),
      mockContext,
      mockDirectorySync,
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { operation: "manual" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.operation).toBe("manual");
    });

    it("should accept optional fields", () => {
      const data = {
        operation: "initial",
        paths: ["/path/to/dir"],
        syncDirection: "import",
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.operation).toBe("initial");
      expect(result?.paths).toEqual(["/path/to/dir"]);
      expect(result?.syncDirection).toBe("import");
    });

    it("should return null for invalid operation", () => {
      const result = handler.validateAndParse({ operation: "invalid" });
      expect(result).toBeNull();
    });

    it("should clean up undefined optional properties", () => {
      const data = { operation: "scheduled" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      // Should not have undefined properties
      expect(Object.keys(result as object)).toEqual(["operation"]);
    });
  });
});
