import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import {
  createSilentLogger,
  createMockServicePluginContext,
  createMockProgressReporter,
  createMockEntityService,
  genericSpy,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectoryImportJobHandler", () => {
  let handler: DirectoryImportJobHandler;

  beforeEach(() => {
    const mockContext = createMockServicePluginContext({
      returns: {
        entityService: {
          getEntity: null,
          createEntity: {
            entityId: "test",
            jobId: "mock-job-id",
            skipped: false,
          },
          updateEntity: {
            entityId: "test",
            jobId: "mock-job-id",
            skipped: false,
          },
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

    it("holds and settles a shared durable projection batch child", async () => {
      const entityService = createMockEntityService();
      const runChild = mock(
        async <TResult>(
          _input: unknown,
          mutation: () => Promise<TResult>,
        ): Promise<TResult> => mutation(),
      );
      const settleChild = mock(async () => true);
      // mock() erases type parameters, so the generic member cannot take the
      // spy directly; genericSpy names that as the only reason.
      entityService.runDurableBulkMutationChild =
        genericSpy<typeof entityService.runDurableBulkMutationChild>(runChild);
      entityService.settleDurableBulkMutationChild = settleChild;
      const context = createMockServicePluginContext({ entityService });
      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        context,
        createMockDirectorySync(),
      );
      const data = {
        paths: ["/path/to/series.md"],
        projectionBatch: {
          operationId: "root-1",
          rootJobId: "root-1",
          childKey: "0:directory-import",
          expectedChildren: 2,
        },
      };

      await testHandler.process(data, "job-1", createMockProgressReporter());
      await testHandler.onTerminalSuccess(data, "job-1");

      expect(runChild).toHaveBeenCalledWith(
        {
          source: "directory-sync",
          operationId: "root-1",
          rootJobId: "root-1",
          childKey: "0:directory-import",
          expectedChildren: 2,
          jobId: "job-1",
        },
        expect.any(Function),
      );
      expect(settleChild).toHaveBeenCalledWith({
        operationId: "root-1",
        childKey: "0:directory-import",
        jobId: "job-1",
        outcome: "completed",
      });
    });
  });
});
