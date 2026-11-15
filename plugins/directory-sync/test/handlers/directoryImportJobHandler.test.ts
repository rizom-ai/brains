import { createMockEntityService } from "@brains/entity-service/test";
import { createMockServicePluginContext } from "@brains/plugins/test";
import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { expectDefined } from "@brains/utils/expect-defined";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import {
  createSilentLogger,
  createMockProgressReporter,
  genericSpy,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";
import { queuedJob } from "../queued-job";

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
      const result = expectDefined(
        queuedJob("directory-import", handler).validateAndParse({}),
        "validateAndParse result",
      );
      // batchSize is optional, defaults applied in process()
      expect(result.batchSize).toBeUndefined();
    });

    it("should validate with paths array", () => {
      const data = { paths: ["/path/to/file1.md", "/path/to/file2.md"] };
      const result = queuedJob("directory-import", handler).validateAndParse(
        data,
      );

      expect(result).not.toBeNull();
      expect(result?.paths).toEqual(["/path/to/file1.md", "/path/to/file2.md"]);
    });

    it("should validate with custom batchSize", () => {
      const data = { batchSize: 50 };
      const result = queuedJob("directory-import", handler).validateAndParse(
        data,
      );

      expect(result).not.toBeNull();
      expect(result?.batchSize).toBe(50);
    });

    it("should validate with batchIndex", () => {
      const data = { batchIndex: 2 };
      const result = queuedJob("directory-import", handler).validateAndParse(
        data,
      );

      expect(result).not.toBeNull();
      expect(result?.batchIndex).toBe(2);
    });

    it("should return null for invalid batchSize", () => {
      const result = queuedJob("directory-import", handler).validateAndParse({
        batchSize: 0,
      });
      expect(result).toBeNull();
    });

    it("should return null for invalid paths type", () => {
      const result = queuedJob("directory-import", handler).validateAndParse({
        paths: "not-an-array",
      });
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
        undefined,
        undefined,
      );
    });

    it("refuses a job naming entity types this process does not register", async () => {
      // An old worker sharing the job queue during a rolling deploy used to
      // skip guide/*.md as unregistered and complete the startup batch, so
      // the new brain reported a successful sync without any guides.
      const entityService = createMockEntityService({ entityTypes: ["doc"] });
      const context = createMockServicePluginContext({ entityService });
      const directory = createMockDirectorySync();
      const imported = spyOn(directory, "importEntitiesWithProgress");
      const requireFullScan = mock(async () => {});
      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        context,
        directory,
        undefined,
        { requireFullScan },
      );

      const failure = await testHandler
        .process(
          {
            paths: ["doc/a.md", "guide/writer.md"],
            entityTypes: ["doc", "guide"],
          },
          "job-1",
          createMockProgressReporter(),
        )
        .catch((error: unknown) => error);

      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toContain("guide");
      expect(imported).not.toHaveBeenCalled();
      expect(requireFullScan).toHaveBeenCalledTimes(1);
    });

    it("imports a job whose entity types are all registered here", async () => {
      const entityService = createMockEntityService({
        entityTypes: ["doc", "guide"],
      });
      const context = createMockServicePluginContext({ entityService });
      const directory = createMockDirectorySync();
      const imported = spyOn(directory, "importEntitiesWithProgress");
      const requireFullScan = mock(async () => {});
      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        context,
        directory,
        undefined,
        { requireFullScan },
      );

      await testHandler.process(
        { paths: ["guide/writer.md"], entityTypes: ["guide"] },
        "job-1",
        createMockProgressReporter(),
      );

      expect(imported).toHaveBeenCalledTimes(1);
      expect(requireFullScan).not.toHaveBeenCalled();
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
      const directory = createMockDirectorySync();
      const imported = spyOn(directory, "importEntitiesWithProgress");
      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        context,
        directory,
      );
      const data = {
        paths: ["/path/to/series.md"],
        plan: [
          {
            path: "/path/to/series.md",
            entityType: "series",
            id: "series",
            expectedRevision: "before-sync",
          },
        ],
        projectionBatch: {
          operationId: "root-1",
          rootJobId: "root-1",
          childKey: "0:directory-import",
          expectedChildren: 2,
        },
      };

      const reporter = createMockProgressReporter();
      await testHandler.process(data, "job-1", reporter);
      await testHandler.onTerminalSuccess(data, "job-1");
      expect(imported).toHaveBeenCalledWith(
        data.paths,
        reporter,
        100,
        data.projectionBatch,
        data.plan,
      );

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
