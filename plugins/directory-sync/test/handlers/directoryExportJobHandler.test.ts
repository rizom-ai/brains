import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryExportJobHandler } from "../../src/handlers/directoryExportJobHandler";
import type { DirectorySync } from "../../src/lib/directory-sync";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";

describe("DirectoryExportJobHandler", () => {
  let handler: DirectoryExportJobHandler;
  let mockDirectorySync: DirectorySync;

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
      processEntityExport: mock(() =>
        Promise.resolve({ success: true, path: "/test/path.md" }),
      ),
    } as unknown as DirectorySync;

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
