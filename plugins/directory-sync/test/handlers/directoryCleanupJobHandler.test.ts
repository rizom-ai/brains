import { describe, it, expect, mock, beforeEach } from "bun:test";
import { DirectoryCleanupJobHandler } from "../../src/handlers/directoryCleanupJobHandler";
import { createSilentLogger } from "@brains/test-utils";
import type { DirectorySync } from "../../src/lib/directory-sync";
import type { ProgressReporter } from "@brains/utils";

function createMockProgressReporter(): ProgressReporter {
  return { report: mock(async () => {}) } as unknown as ProgressReporter;
}

describe("DirectoryCleanupJobHandler", () => {
  let removeOrphanedEntitiesMock: ReturnType<typeof mock>;
  let handler: DirectoryCleanupJobHandler;

  beforeEach(() => {
    removeOrphanedEntitiesMock = mock(async () => ({
      deleted: 3,
      errors: [],
    }));

    handler = new DirectoryCleanupJobHandler(createSilentLogger("test"), {
      removeOrphanedEntities: removeOrphanedEntitiesMock,
    } as unknown as DirectorySync);
  });

  it("should validate correct job data", () => {
    const result = handler.validateAndParse({});
    expect(result).not.toBeNull();
  });

  it("should call removeOrphanedEntities", async () => {
    const reporter = createMockProgressReporter();
    await handler.process({}, "job-1", reporter);

    expect(removeOrphanedEntitiesMock).toHaveBeenCalledTimes(1);
  });

  it("should return cleanup result", async () => {
    const reporter = createMockProgressReporter();
    const result = await handler.process({}, "job-1", reporter);

    expect(result.deleted).toBe(3);
    expect(result.errors).toEqual([]);
  });

  it("should report progress", async () => {
    const reporter = createMockProgressReporter();
    await handler.process({}, "job-1", reporter);

    expect(reporter.report).toHaveBeenCalled();
  });
});
