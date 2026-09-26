import { createMockShell } from "@brains/plugins/test";
import { hostFor } from "../helpers/install";
import { describe, it, expect, mock } from "bun:test";
import { DirectoryExportJobHandler } from "../../src/handlers/directoryExportJobHandler";
import {
  createSilentLogger,
  createMockProgressReporter,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectoryExportJobHandler", () => {
  describe("process", () => {
    it("should delegate to DirectorySync export pipeline with progress", async () => {
      const exportWithProgress = mock(() =>
        Promise.resolve({ exported: 2, failed: 0, errors: [] }),
      );
      const mockContext = await hostFor(createMockShell());
      const mockDirSync = createMockDirectorySync({
        exportEntitiesWithProgress: exportWithProgress,
      });
      const testHandler = new DirectoryExportJobHandler(
        createSilentLogger("test"),
        mockContext,
        mockDirSync,
      );
      const reporter = createMockProgressReporter();

      const result = await testHandler.process(
        { entityTypes: ["note"], batchSize: 25 },
        "test-job",
        reporter,
      );

      expect(result.exported).toBe(2);
      expect(exportWithProgress).toHaveBeenCalledWith(["note"], reporter, 25);
    });
  });
});
