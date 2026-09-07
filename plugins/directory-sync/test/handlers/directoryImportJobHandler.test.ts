import { createMockEntityService } from "@brains/entity-service/test";
import { createEntityBulkCoordination } from "@brains/entity-service";
import { createMockShell } from "@brains/plugins/test";
import { hostFor } from "../helpers/install";
import { describe, it, expect, mock } from "bun:test";
import { DirectoryImportJobHandler } from "../../src/handlers/directoryImportJobHandler";
import {
  createSilentLogger,
  createMockProgressReporter,
  genericSpy,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectoryImportJobHandler", () => {
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
      const mockContext = await hostFor(createMockShell());
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
      const host = await hostFor(createMockShell());
      // The batch child runs under the coordination the test observes.
      const context = {
        ...host,
        mirror: {
          ...host.mirror,
          coordination: createEntityBulkCoordination(
            entityService,
            "directory-sync",
          ),
        },
      };
      const testHandler = new DirectoryImportJobHandler(
        createSilentLogger("test"),
        context,
        createMockDirectorySync(),
      );
      const data = {
        paths: ["/path/to/series.md"],
        projectionBatch: {
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
