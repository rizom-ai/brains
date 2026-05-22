import { describe, it, expect, mock } from "bun:test";
import {
  persistImportEntity,
  type ImportPersistenceDeps,
} from "../src/lib/import-persistence";
import { createSilentLogger } from "@brains/test-utils";
import type { BaseEntity } from "@brains/plugins";
import type { ImportResult, RawEntity } from "../src/types";

function makeRawEntity(): RawEntity {
  return {
    entityType: "note",
    id: "note-1",
    content: "# Note\n\nBody.",
    created: new Date("2026-01-01T00:00:00Z"),
    updated: new Date("2026-01-02T00:00:00Z"),
  };
}

function createMockDeps(): ImportPersistenceDeps {
  const getEntity = mock(
    (): Promise<BaseEntity | null> => Promise.resolve(null),
  );
  const upsertEntity = mock(async (_request: { entity: BaseEntity }) => ({
    jobId: "j1",
  }));
  return {
    entityService: {
      getEntity,
      upsertEntity,
      serializeEntity: () => "serialized",
    },
    logger: createSilentLogger(),
    fileOperations: {
      shouldUpdateEntity: () => true,
    },
    quarantine: {
      isValidationError: () => false,
      quarantineInvalidFile: mock(async () => {}),
      markAsRecoveredIfNeeded: mock(async () => {}),
    },
    imageJobQueue: {
      syncPath: "/tmp/sync",
    },
  };
}

describe("persistImportEntity visibility", () => {
  it("looks up existing entities across all visibility tiers", async () => {
    const deps = createMockDeps();
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
    };

    await persistImportEntity(
      deps,
      makeRawEntity(),
      {},
      "note/note-1.md",
      result,
    );

    expect(deps.entityService.getEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: "note",
        id: "note-1",
        visibilityScope: "restricted",
      }),
    );
  });
});
