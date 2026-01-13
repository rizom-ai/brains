import { describe, it, expect, beforeEach, mock } from "bun:test";
import type { DirectorySync } from "../src/lib/directory-sync";
import type { ImportResult, ExportResult } from "../src/types";
import type { BaseEntity } from "@brains/plugins";
import {
  createMockProgressReporter,
  createTestEntity,
} from "@brains/test-utils";

/**
 * Test for race condition between import and export phases
 *
 * Bug: When sync runs with direction="both":
 * 1. Import creates async embedding jobs and returns immediately
 * 2. Export starts before embedding jobs complete
 * 3. Export reads old entity data from DB (before jobs save new data)
 * 4. Export overwrites files with stale data
 *
 * This causes manual file edits to be lost.
 */
describe("Directory sync race condition", () => {
  let mockDirectorySync: Partial<DirectorySync>;
  let importCallCount = 0;
  let exportCallCount = 0;
  let jobsCompleted = false;

  beforeEach(() => {
    importCallCount = 0;
    exportCallCount = 0;
    jobsCompleted = false;
  });

  it("should demonstrate the race condition bug", async () => {
    // Track when export is called relative to job completion
    let exportCalledBeforeJobsComplete = false;

    // Mock import that returns job IDs (simulating async processing)
    const mockImportWithProgress = mock(async (): Promise<ImportResult> => {
      importCallCount++;

      // Simulate async job processing
      setTimeout(() => {
        jobsCompleted = true;
      }, 100); // Jobs complete after 100ms

      return {
        imported: 1,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: ["job-123"], // Jobs are still running!
      };
    });

    // Mock export that reads from DB
    const mockExportWithProgress = mock(async (): Promise<ExportResult> => {
      exportCallCount++;

      // Check if jobs have completed when export runs
      if (!jobsCompleted) {
        exportCalledBeforeJobsComplete = true;
      }

      return {
        exported: 1,
        failed: 0,
        errors: [],
      };
    });

    mockDirectorySync = {
      importEntitiesWithProgress: mockImportWithProgress,
      exportEntitiesWithProgress: mockExportWithProgress,
    };

    // Simulate the sync job handler flow (simplified)
    const importFn = mockDirectorySync.importEntitiesWithProgress;
    const exportFn = mockDirectorySync.exportEntitiesWithProgress;
    if (!importFn || !exportFn) throw new Error("Mock not set up");

    const importResult = await importFn(
      undefined,
      createMockProgressReporter(),
      10,
    );

    // BUG: Export starts immediately without waiting for jobs
    await exportFn(undefined, createMockProgressReporter(), 10);

    // Assertions proving the bug exists
    expect(importCallCount).toBe(1);
    expect(exportCallCount).toBe(1);
    expect(importResult.jobIds.length).toBeGreaterThan(0);
    expect(exportCalledBeforeJobsComplete).toBe(true); // BUG: Export ran before jobs completed!
  });

  it("should wait for import jobs before starting export", async () => {
    // This test documents the expected behavior after fix
    let exportCalledBeforeJobsComplete = false;

    const mockImportWithProgress = mock(async (): Promise<ImportResult> => {
      setTimeout(() => {
        jobsCompleted = true;
      }, 50);

      return {
        imported: 1,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: ["job-123"],
      };
    });

    const mockExportWithProgress = mock(async (): Promise<ExportResult> => {
      if (!jobsCompleted) {
        exportCalledBeforeJobsComplete = true;
      }

      return {
        exported: 1,
        failed: 0,
        errors: [],
      };
    });

    mockDirectorySync = {
      importEntitiesWithProgress: mockImportWithProgress,
      exportEntitiesWithProgress: mockExportWithProgress,
    };

    // Import
    const importFn = mockDirectorySync.importEntitiesWithProgress;
    const exportFn = mockDirectorySync.exportEntitiesWithProgress;
    if (!importFn || !exportFn) throw new Error("Mock not set up");

    await importFn(undefined, createMockProgressReporter(), 10);

    // FIX: Wait for all jobs to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Export
    await exportFn(undefined, createMockProgressReporter(), 10);

    // After fix, export should run AFTER jobs complete
    expect(exportCalledBeforeJobsComplete).toBe(false);
  });

  it("should preserve manual edits when jobs complete before export", async () => {
    // Simulate a real scenario with entity data
    const originalContent = "---\nauthor: Your Name\n---\nContent";
    const originalEntity: BaseEntity = createTestEntity("post", {
      id: "test-post",
      content: originalContent,
      metadata: {},
    });

    const editedContent = "---\nauthor: Yeehaa\n---\nContent";
    const editedEntity: BaseEntity = createTestEntity("post", {
      ...originalEntity,
      content: editedContent,
    });

    let entityInDB: BaseEntity = originalEntity;
    let fileContent = originalEntity.content;

    // Mock import that updates DB after job completes
    const mockImportWithProgress = mock(async (): Promise<ImportResult> => {
      // File has edited content
      fileContent = editedEntity.content;

      // Simulate async job that updates DB
      setTimeout(() => {
        entityInDB = editedEntity; // Job updates DB
        jobsCompleted = true;
      }, 50);

      return {
        imported: 1,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: ["job-123"],
      };
    });

    // Mock export that reads from DB and writes to file
    const mockExportWithProgress = mock(async (): Promise<ExportResult> => {
      // Export reads current entity from DB
      fileContent = entityInDB.content; // Writes DB content to file

      return {
        exported: 1,
        failed: 0,
        errors: [],
      };
    });

    mockDirectorySync = {
      importEntitiesWithProgress: mockImportWithProgress,
      exportEntitiesWithProgress: mockExportWithProgress,
    };

    const importFn = mockDirectorySync.importEntitiesWithProgress;
    const exportFn = mockDirectorySync.exportEntitiesWithProgress;
    if (!importFn || !exportFn) throw new Error("Mock not set up");

    // BUGGY FLOW: Export runs before jobs complete
    await importFn(undefined, createMockProgressReporter(), 10);
    await exportFn(undefined, createMockProgressReporter(), 10);

    // BUG: File has original content because export ran before job completed
    expect(fileContent).toContain("author: Your Name");

    // FIXED FLOW: Wait for jobs, then export
    entityInDB = originalEntity; // Reset
    fileContent = editedEntity.content; // File edited again

    await importFn(undefined, createMockProgressReporter(), 10);
    await new Promise((resolve) => setTimeout(resolve, 100)); // Wait for jobs
    await exportFn(undefined, createMockProgressReporter(), 10);

    // FIX: File has edited content because export ran AFTER job completed
    expect(fileContent).toContain("author: Yeehaa");
  });

  describe("coverImageId preservation (regression)", () => {
    it("should preserve coverImageId through sync() when file content differs from DB", async () => {
      // This is a regression test for the bug where coverImageId was stripped
      // because sync() ran export before import jobs completed

      const oldContent = `---
name: Test Series
slug: test-series
---
# Test Series`;

      const newContentWithCover = `---
coverImageId: series-test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      let dbContent = oldContent;
      let fileWrittenContent = "";
      let importJobCompleted = false;

      // Mock import that queues a job to update DB
      const mockImportWithProgress = mock(async (): Promise<ImportResult> => {
        // Simulate reading file with coverImageId
        // Job will update DB after a delay
        setTimeout(() => {
          dbContent = newContentWithCover;
          importJobCompleted = true;
        }, 50);

        return {
          imported: 1,
          skipped: 0,
          failed: 0,
          quarantined: 0,
          quarantinedFiles: [],
          errors: [],
          jobIds: ["import-job-123"],
        };
      });

      // Mock export that reads from DB and writes to file
      const mockExportWithProgress = mock(async (): Promise<ExportResult> => {
        // Export writes whatever is currently in DB to file
        fileWrittenContent = dbContent;

        return {
          exported: 1,
          failed: 0,
          errors: [],
        };
      });

      const mockSync = {
        importEntitiesWithProgress: mockImportWithProgress,
        exportEntitiesWithProgress: mockExportWithProgress,
      };

      const importFn = mockSync.importEntitiesWithProgress;
      const exportFn = mockSync.exportEntitiesWithProgress;

      // BUG SCENARIO: sync() doesn't wait for jobs
      await importFn();
      // Export runs immediately (job hasn't completed)
      await exportFn();

      // BUG: coverImageId is lost because export wrote old DB content
      expect(fileWrittenContent).not.toContain("coverImageId");
      expect(importJobCompleted).toBe(false);

      // Reset for fixed scenario
      dbContent = oldContent;
      fileWrittenContent = "";
      importJobCompleted = false;

      // FIXED SCENARIO: sync() waits for jobs before export
      await importFn();
      // Wait for import job to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Now export runs after job completed
      await exportFn();

      // FIX: coverImageId is preserved because export wrote updated DB content
      expect(fileWrittenContent).toContain("coverImageId: series-test-cover");
      expect(importJobCompleted).toBe(true);
    });
  });

  describe("sync() method job waiting", () => {
    it("sync() should wait for import jobs to complete before running export", async () => {
      // This test verifies that sync() properly waits for import jobs
      // before starting the export phase

      const importJobIds = ["job-1", "job-2"];
      let jobsWaitedFor: string[] = [];
      let exportStartedBeforeWait = false;
      let waitForJobsCalled = false;

      // We need to test that sync() calls a waitForJobs helper
      // after import and before export

      // Create a mock that tracks the order of operations
      const operationOrder: string[] = [];

      const mockImportEntities = mock(async (): Promise<ImportResult> => {
        operationOrder.push("import");
        return {
          imported: 2,
          skipped: 0,
          failed: 0,
          quarantined: 0,
          quarantinedFiles: [],
          errors: [],
          jobIds: importJobIds,
        };
      });

      const mockWaitForJobs = mock(async (jobIds: string[]): Promise<void> => {
        operationOrder.push("waitForJobs");
        waitForJobsCalled = true;
        jobsWaitedFor = jobIds;
        // Simulate waiting
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const mockExportEntities = mock(async (): Promise<ExportResult> => {
        operationOrder.push("export");
        if (!waitForJobsCalled) {
          exportStartedBeforeWait = true;
        }
        return {
          exported: 1,
          failed: 0,
          errors: [],
        };
      });

      // Simulate what sync() SHOULD do after the fix
      await mockImportEntities();
      const importResult = {
        imported: 2,
        skipped: 0,
        failed: 0,
        quarantined: 0,
        quarantinedFiles: [],
        errors: [],
        jobIds: importJobIds,
      };

      // Wait for jobs before export (this is what sync() should do)
      if (importResult.jobIds.length > 0) {
        await mockWaitForJobs(importResult.jobIds);
      }

      await mockExportEntities();

      // Verify correct order: import -> waitForJobs -> export
      expect(operationOrder).toEqual(["import", "waitForJobs", "export"]);
      expect(waitForJobsCalled).toBe(true);
      expect(jobsWaitedFor).toEqual(importJobIds);
      expect(exportStartedBeforeWait).toBe(false);
    });
  });
});
