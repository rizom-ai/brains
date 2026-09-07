import { createMockShell } from "@brains/plugins/test";
import { hostFor } from "../helpers/install";
import { describe, it, expect, mock } from "bun:test";
import { DirectorySyncJobHandler } from "../../src/handlers/directorySyncJobHandler";
import {
  createSilentLogger,
  createMockProgressReporter,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectorySyncJobHandler", () => {
  it("pins one directory generation for the complete job", async () => {
    let releaseImport = (): void => {};
    const importGate = new Promise<void>((resolve) => {
      releaseImport = resolve;
    });
    let markImportStarted = (): void => {};
    const importStarted = new Promise<void>((resolve) => {
      markImportStarted = resolve;
    });
    const firstExport = mock(async () => ({
      exported: 1,
      failed: 0,
      errors: [],
    }));
    const first = createMockDirectorySync({
      importEntitiesWithProgress: mock(async () => {
        markImportStarted();
        await importGate;
        return {
          imported: 1,
          skipped: 0,
          failed: 0,
          quarantined: 0,
          quarantinedFiles: [],
          errors: [],
          jobIds: [],
        };
      }),
      exportEntitiesWithProgress: firstExport,
    });
    const secondExport = mock(async () => ({
      exported: 1,
      failed: 0,
      errors: [],
    }));
    const second = createMockDirectorySync({
      exportEntitiesWithProgress: secondExport,
    });
    let active = first;
    const pinnedHandler = new DirectorySyncJobHandler(
      createSilentLogger("test"),
      await hostFor(createMockShell()),
      () => active,
    );

    const processing = pinnedHandler.process(
      { operation: "manual", syncDirection: "both" },
      "job-1",
      createMockProgressReporter(),
    );
    await importStarted;
    active = second;
    releaseImport();
    await processing;

    expect(firstExport).toHaveBeenCalledTimes(1);
    expect(secondExport).not.toHaveBeenCalled();
  });
});
