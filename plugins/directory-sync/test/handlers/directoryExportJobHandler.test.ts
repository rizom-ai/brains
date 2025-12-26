import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryExportJobHandler } from "../../src/handlers/directoryExportJobHandler";
import type { IDirectorySync } from "../../src/types";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("DirectoryExportJobHandler", () => {
  let handler: DirectoryExportJobHandler;
  let mockDirectorySync: IDirectorySync;

  beforeEach(() => {
    const mockContext = createMockServicePluginContext({
      entityTypes: ["note", "topic"],
      returns: {
        entityService: {
          listEntities: [],
        },
      },
    });

    mockDirectorySync = {
      processEntityExport: mock(() => Promise.resolve({ success: true })),
      getAllMarkdownFiles: mock(() => []),
      fileOps: {
        readEntity: mock(() => Promise.resolve({} as never)),
        parseEntityFromPath: mock(() => ({ entityType: "note", id: "test" })),
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
    };

    handler = new DirectoryExportJobHandler(
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

    it("should validate with entityTypes array", () => {
      const data = { entityTypes: ["note", "topic"] };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.entityTypes).toEqual(["note", "topic"]);
    });

    it("should validate with custom batchSize", () => {
      const data = { batchSize: 25 };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.batchSize).toBe(25);
    });

    it("should return null for invalid batchSize", () => {
      const result = handler.validateAndParse({ batchSize: 0 });
      expect(result).toBeNull();
    });

    it("should return null for invalid entityTypes type", () => {
      const result = handler.validateAndParse({ entityTypes: "not-an-array" });
      expect(result).toBeNull();
    });
  });
});
