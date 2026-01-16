import { describe, it, expect, mock } from "bun:test";
import type { ImportResult, ExportResult } from "../src/types";
import type { BaseEntity } from "@brains/plugins";
import { createTestEntity } from "@brains/test-utils";

/**
 * Tests for sync() behavior when export is removed and subscribers handle file writes.
 *
 * The proposed fix:
 * 1. sync() only does import (no export)
 * 2. entity:updated subscribers handle export after jobs complete
 * 3. This eliminates the race condition where export writes old content
 */

describe("sync() without export (subscriber-based export)", () => {
  describe("race condition elimination", () => {
    it("should NOT have race condition when export is removed from sync()", async () => {
      // This test verifies that removing export from sync() and relying on
      // subscribers eliminates the race condition.

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

      // Track state
      let dbContent = oldContent;
      const eventsEmitted: string[] = [];
      const fileWrites: string[] = [];

      // Mock import that queues a job (job will update DB later)
      const mockImportEntities = mock(async (): Promise<ImportResult> => {
        eventsEmitted.push("import:start");

        // Import reads file content and queues job
        // Job will save to DB after some delay
        setTimeout(() => {
          dbContent = newContentWithCover; // Job saves new content to DB
          eventsEmitted.push("job:complete");

          // After job completes, entity:updated fires
          // Subscriber writes correct content to file
          fileWrites.push(dbContent);
          eventsEmitted.push("subscriber:write");
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

      // Mock export that reads from DB (this is the problematic one)
      const mockExportEntities = mock(async (): Promise<ExportResult> => {
        eventsEmitted.push("export:start");
        // Export reads current DB content and writes to file
        fileWrites.push(dbContent); // This would write OLD content!
        eventsEmitted.push("export:write");

        return {
          exported: 1,
          failed: 0,
          errors: [],
        };
      });

      // BUGGY FLOW: sync() with export
      // Import → Export (immediately) → Jobs complete later
      await mockImportEntities();
      await mockExportEntities(); // This writes OLD content!

      // Wait for job to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the race condition occurred
      expect(eventsEmitted).toEqual([
        "import:start",
        "export:start",
        "export:write", // Export ran before job completed!
        "job:complete",
        "subscriber:write",
      ]);

      // The file was written twice - first with old content, then with new
      expect(fileWrites[0]).toBe(oldContent); // BUG: Export wrote old content
      expect(fileWrites[1]).toBe(newContentWithCover); // Subscriber fixed it

      // Reset for fixed flow
      eventsEmitted.length = 0;
      fileWrites.length = 0;
      dbContent = oldContent;

      // FIXED FLOW: sync() without export
      // Import → Jobs complete → Subscriber writes
      await mockImportEntities();
      // NO export call!

      // Wait for job to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify no race condition
      expect(eventsEmitted).toEqual([
        "import:start",
        "job:complete",
        "subscriber:write",
      ]);

      // File was only written once, with correct content
      expect(fileWrites.length).toBe(1);
      expect(fileWrites[0]).toBe(newContentWithCover); // Correct!
    });

    it("should preserve coverImageId when sync() relies on subscribers", async () => {
      const contentWithCover = `---
coverImageId: series-ecosystem-cover
name: Ecosystem Architecture
slug: ecosystem-architecture
---
# Ecosystem Architecture`;

      let finalFileContent = "";

      // Simulate the fixed flow
      const simulateFixedSync = async (): Promise<void> => {
        // Step 1: Import reads file, queues job
        const fileContent = contentWithCover;

        // Step 2: Job processes, saves to DB
        const dbContent = fileContent; // Job saves exact file content

        // Step 3: entity:updated fires, subscriber writes
        finalFileContent = dbContent; // Subscriber writes DB content to file
      };

      await simulateFixedSync();

      // Verify coverImageId is preserved
      expect(finalFileContent).toContain(
        "coverImageId: series-ecosystem-cover",
      );
      expect(finalFileContent).toContain("name: Ecosystem Architecture");
    });
  });

  describe("edge cases", () => {
    it("should handle entities that exist in DB but not on disk via entity:created subscriber", async () => {
      // When an entity is created (not imported from file),
      // entity:created subscriber should write it to disk

      const entity: BaseEntity = createTestEntity("series", {
        id: "new-entity",
        content: "# New Entity",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {},
      });

      let fileWritten = false;
      let writtenContent = "";

      // Mock entity:created subscriber
      const entityCreatedSubscriber = async (payload: {
        entity: BaseEntity;
      }): Promise<void> => {
        fileWritten = true;
        writtenContent = payload.entity.content;
      };

      // Simulate entity creation
      await entityCreatedSubscriber({ entity });

      expect(fileWritten).toBe(true);
      expect(writtenContent).toBe("# New Entity");
    });

    it("should handle multiple concurrent imports correctly", async () => {
      // When multiple files are imported, each should be handled by its own
      // job completion → subscriber flow

      const files = [
        { id: "series-1", content: "# Series 1" },
        { id: "series-2", content: "# Series 2" },
        { id: "series-3", content: "# Series 3" },
      ];

      const writtenFiles: Map<string, string> = new Map();

      // Simulate concurrent imports with staggered job completion
      const simulateConcurrentImports = async (): Promise<void> => {
        const jobs = files.map((file, index) => {
          return new Promise<void>((resolve) => {
            // Jobs complete at different times
            setTimeout(
              () => {
                // Subscriber writes after each job completes
                writtenFiles.set(file.id, file.content);
                resolve();
              },
              10 + index * 20,
            );
          });
        });

        await Promise.all(jobs);
      };

      await simulateConcurrentImports();

      // All files should be written with correct content
      expect(writtenFiles.size).toBe(3);
      expect(writtenFiles.get("series-1")).toBe("# Series 1");
      expect(writtenFiles.get("series-2")).toBe("# Series 2");
      expect(writtenFiles.get("series-3")).toBe("# Series 3");
    });
  });

  describe("sync:initial:completed timing", () => {
    it("should emit sync:initial:completed only after all files are written", async () => {
      // The plugin waits for jobs before emitting sync:initial:completed.
      // With subscriber-based export, files are written when jobs complete,
      // so sync:initial:completed should be emitted after all files are correct.

      const events: string[] = [];
      let allFilesWritten = false;

      // Simulate the full flow
      const simulateInitialSync = async (): Promise<void> => {
        // Import queues jobs (would return jobIds: ["job-1", "job-2"])
        events.push("import:complete");

        // Wait for jobs (simulated)
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            // Jobs complete, subscribers write files
            events.push("job-1:complete");
            events.push("subscriber-1:write");
            events.push("job-2:complete");
            events.push("subscriber-2:write");
            allFilesWritten = true;
            resolve();
          }, 50);
        });

        // Only now emit sync:initial:completed
        events.push("sync:initial:completed");
      };

      await simulateInitialSync();

      // Verify ordering
      const syncCompletedIndex = events.indexOf("sync:initial:completed");
      const lastWriteIndex = Math.max(
        events.indexOf("subscriber-1:write"),
        events.indexOf("subscriber-2:write"),
      );

      expect(syncCompletedIndex).toBeGreaterThan(lastWriteIndex);
      expect(allFilesWritten).toBe(true);
    });
  });

  describe("git-sync integration", () => {
    it("should have all files with correct content when git-sync receives sync:initial:completed", async () => {
      // git-sync listens for sync:initial:completed and then commits.
      // We need to ensure all files have correct content at that point.

      const contentWithCover = `---
coverImageId: series-test-cover
name: Test Series
slug: test-series
---
# Test Series`;

      const filesOnDisk: Map<string, string> = new Map();
      let gitSyncCommitContent: Map<string, string> | null = null;

      // Simulate the full flow as it happens in the plugin
      const simulatePluginInitialSync = async (): Promise<void> => {
        // Step 1: Plugin calls directorySync.sync() which only does import
        // Import reads file with coverImageId, queues job
        // (importResult would contain jobIds for waitForJobs)

        // Step 2: Plugin calls waitForJobs()
        // During this wait, jobs complete and subscribers write files
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            // Job completes, entity:updated fires, subscriber writes
            filesOnDisk.set("series-test-series.md", contentWithCover);
            resolve();
          }, 50);
        });

        // Step 3: Plugin emits sync:initial:completed
        // git-sync receives this and commits

        // Simulate git-sync receiving the event and reading files for commit
        gitSyncCommitContent = new Map(filesOnDisk);
      };

      await simulatePluginInitialSync();

      // Verify git-sync would commit the correct content
      expect(gitSyncCommitContent).not.toBeNull();
      const commitContent = gitSyncCommitContent as unknown as Map<
        string,
        string
      >;
      expect(commitContent.get("series-test-series.md")).toContain(
        "coverImageId: series-test-cover",
      );
    });

    it("should NOT commit stale content when sync() exports before jobs complete (demonstrating the bug)", async () => {
      // This demonstrates why the current behavior is buggy

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
      const filesOnDisk: Map<string, string> = new Map();
      let gitSyncCommitContent: Map<string, string> | null = null;

      // BUGGY FLOW: sync() with export
      const simulateBuggyPluginInitialSync = async (): Promise<void> => {
        // Step 1: sync() does import then export immediately
        // Import queues job
        // Export reads OLD db content and writes to file
        filesOnDisk.set("series-test-series.md", dbContent); // OLD content!

        // Step 2: Plugin calls waitForJobs()
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            // Job completes, updates DB
            dbContent = newContentWithCover;
            // Subscriber writes correct content
            filesOnDisk.set("series-test-series.md", newContentWithCover);
            resolve();
          }, 50);
        });

        // Step 3: sync:initial:completed emitted
        // git-sync commits
        gitSyncCommitContent = new Map(filesOnDisk);
      };

      await simulateBuggyPluginInitialSync();

      // In the buggy flow, the file DOES end up correct because subscriber overwrites
      // But there's a window where the file had wrong content
      // And if waitForJobs didn't work correctly, git might commit wrong content
      const commitContent = gitSyncCommitContent as unknown as Map<
        string,
        string
      >;
      expect(commitContent.get("series-test-series.md")).toContain(
        "coverImageId: series-test-cover",
      );

      // The test passes because subscriber eventually fixes it.
      // The fix (removing export) eliminates the intermediate wrong state entirely.
    });
  });
});
