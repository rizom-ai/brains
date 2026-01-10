import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import type { IDirectorySync } from "../../src/types";
import {
  createSilentLogger,
  createMockServicePluginContext,
} from "@brains/test-utils";
import type { IEntityService, ProgressReporter } from "@brains/plugins";
import { computeContentHash } from "@brains/utils";

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

      const existingEntity = {
        id: "series-test-series",
        entityType: "series",
        content: oldContent,
        contentHash: computeContentHash(oldContent),
        created: "2025-01-01T10:00:00.000Z",
        updated: "2025-01-01T12:00:00.000Z", // Same or newer than file mtime
        metadata: { name: "Test Series", slug: "test-series" },
      };

      // File has OLDER mtime but DIFFERENT content
      const fileEntity = {
        id: "series-test-series",
        entityType: "series",
        content: newContent,
        created: new Date("2025-01-01T10:00:00.000Z"),
        updated: new Date("2025-01-01T11:00:00.000Z"), // OLDER than entity.updated
      };

      const updateEntityMock = mock(() =>
        Promise.resolve({ entityId: "series-test-series", jobId: "job-1" }),
      );

      // Create custom entity service with proper mocks
      const mockEntityService = {
        getEntity: mock(() => Promise.resolve(existingEntity)),
        createEntity: mock(() =>
          Promise.resolve({ entityId: "test", jobId: "job-1" }),
        ),
        updateEntity: updateEntityMock,
        deleteEntity: mock(() => Promise.resolve(true)),
        upsertEntity: mock(() =>
          Promise.resolve({ entityId: "test", jobId: "job-1", created: false }),
        ),
        listEntities: mock(() => Promise.resolve([])),
        search: mock(() => Promise.resolve([])),
        getEntityTypes: mock(() => ["series", "note", "post"]),
        hasEntityType: mock((type: string) =>
          ["series", "note", "post"].includes(type),
        ),
        serializeEntity: mock(() => ""),
        deserializeEntity: mock(() => ({
          content: newContent,
          entityType: "series",
          metadata: { name: "Test Series", slug: "test-series" },
        })),
        getAsyncJobStatus: mock(() =>
          Promise.resolve({ status: "completed" as const }),
        ),
        countEntities: mock(() => Promise.resolve(0)),
        getEntityCounts: mock(() => Promise.resolve([])),
        storeEmbedding: mock(() => Promise.resolve()),
        getWeightMap: mock(() => ({})),
      };

      const mockContext = createMockServicePluginContext({
        entityService: mockEntityService as unknown as IEntityService,
      });

      const mockDirSync: IDirectorySync = {
        getAllMarkdownFiles: mock(() => ["/path/to/series.md"]),
        fileOps: {
          readEntity: mock(() => Promise.resolve(fileEntity)),
          parseEntityFromPath: mock(() => ({
            entityType: "series",
            id: "series-test-series",
          })),
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

      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        mockContext,
        mockDirSync,
      );

      const mockProgressReporter = {
        report: mock(() => Promise.resolve()),
        heartbeatInterval: 30000,
        callback: mock(() => Promise.resolve()),
        createSub: mock(() => ({
          report: mock(() => Promise.resolve()),
          heartbeatInterval: 30000,
          callback: mock(() => Promise.resolve()),
          createSub: mock(() => ({})),
          startHeartbeat: mock(() => {}),
          stopHeartbeat: mock(() => {}),
          finish: mock(() => Promise.resolve()),
        })),
        startHeartbeat: mock(() => {}),
        stopHeartbeat: mock(() => {}),
        finish: mock(() => Promise.resolve()),
      };

      const result = await testHandler.process(
        { paths: ["/path/to/series.md"] },
        "test-job",
        mockProgressReporter as unknown as ProgressReporter,
      );

      // EXPECTED: Entity should be updated because content hash differs
      expect(result.imported).toBe(1);
      expect(result.skipped).toBe(0);
      expect(updateEntityMock).toHaveBeenCalled();
    });
  });
});
