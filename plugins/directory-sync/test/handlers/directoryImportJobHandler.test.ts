import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import type { ServicePluginContext } from "@brains/plugins";
import type { DirectorySync } from "../../src/lib/directory-sync";
import { createSilentLogger } from "@brains/test-utils";

describe("DirectoryImportJobHandler", () => {
  let handler: DirectoryImportJobHandler;
  let mockContext: ServicePluginContext;
  let mockDirectorySync: DirectorySync;

  beforeEach(() => {
    mockContext = {
      entityService: {
        getEntityTypes: mock(() => []),
        getEntity: mock(() => Promise.resolve(null)),
        createEntity: mock(() => Promise.resolve({ entityId: "test" })),
        updateEntity: mock(() => Promise.resolve({ entityId: "test" })),
        deserializeEntity: mock(() => ({})),
      },
    } as unknown as ServicePluginContext;

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
    } as unknown as DirectorySync;

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
