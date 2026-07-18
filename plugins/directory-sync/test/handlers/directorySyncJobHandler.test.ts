import { describe, it, expect, beforeEach, mock } from "bun:test";
import { DirectorySyncJobHandler } from "../../src/handlers/directorySyncJobHandler";
import {
  createSilentLogger,
  createMockProgressReporter,
  createMockServicePluginContext,
} from "@brains/test-utils";
import { createMockDirectorySync } from "../fixtures";

describe("DirectorySyncJobHandler", () => {
  let handler: DirectorySyncJobHandler;

  beforeEach(() => {
    handler = new DirectorySyncJobHandler(
      createSilentLogger("test"),
      createMockServicePluginContext(),
      () => createMockDirectorySync(),
    );
  });

  describe("validateAndParse", () => {
    it("should validate correct job data", () => {
      const data = { operation: "manual" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.operation).toBe("manual");
    });

    it("should accept optional fields", () => {
      const data = {
        operation: "initial",
        paths: ["/path/to/dir"],
        syncDirection: "import",
      };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      expect(result?.operation).toBe("initial");
      expect(result?.paths).toEqual(["/path/to/dir"]);
      expect(result?.syncDirection).toBe("import");
    });

    it("should return null for invalid operation", () => {
      const result = handler.validateAndParse({ operation: "invalid" });
      expect(result).toBeNull();
    });

    it("should clean up undefined optional properties", () => {
      const data = { operation: "scheduled" };
      const result = handler.validateAndParse(data);

      expect(result).not.toBeNull();
      // Should not have undefined properties
      expect(Object.keys(result as object)).toEqual(["operation"]);
    });
  });

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
      createMockServicePluginContext(),
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
