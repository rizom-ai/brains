import { describe, it, expect, mock } from "bun:test";
import {
  persistImportEntity,
  type ImportPersistenceDeps,
} from "../src/lib/import-persistence";
import type { BaseEntity } from "@brains/plugins";
import type { ImportResult, RawEntity } from "../src/types";

function makeRawEntity(content = "# Note\n\nBody."): RawEntity {
  return {
    entityType: "note",
    id: "note-1",
    content,
    created: new Date("2026-01-01T00:00:00Z"),
    updated: new Date("2026-01-02T00:00:00Z"),
  };
}

function makeExistingEntity(
  visibility: BaseEntity["visibility"] = "restricted",
): BaseEntity {
  return {
    id: "note-1",
    entityType: "note",
    content: "# Note\n\nOld body.",
    visibility,
    metadata: {},
    created: "2025-01-01T00:00:00.000Z",
    updated: "2025-01-02T00:00:00.000Z",
    contentHash: "old-hash",
  };
}

function createImportResult(): ImportResult {
  return {
    imported: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    quarantinedFiles: [],
    errors: [],
    jobIds: [],
  };
}

function createMockDeps(
  existing: BaseEntity | null = null,
): ImportPersistenceDeps {
  const getEntity = mock((): Promise<BaseEntity | null> =>
    Promise.resolve(existing),
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
    logger: {
      debug: mock(() => {}),
      warn: mock(() => {}),
      error: mock(() => {}),
    } as unknown as ImportPersistenceDeps["logger"],
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
    const result = createImportResult();

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

  it("preserves existing restricted visibility when imported markdown omits visibility", async () => {
    const deps = createMockDeps(makeExistingEntity("restricted"));
    const result = createImportResult();

    await persistImportEntity(
      deps,
      makeRawEntity("# Note\n\nUpdated body."),
      {
        content: "# Note\n\nUpdated body.",
        entityType: "note",
        metadata: { title: "Note" },
        visibility: "public",
      },
      "note/note-1.md",
      result,
    );

    expect(deps.entityService.upsertEntity).toHaveBeenCalledWith({
      entity: expect.objectContaining({ visibility: "restricted" }),
    });
  });

  it("allows explicit visibility frontmatter to change existing visibility", async () => {
    const deps = createMockDeps(makeExistingEntity("restricted"));
    const result = createImportResult();
    const content = "---\nvisibility: public\n---\n# Note\n\nUpdated body.";

    await persistImportEntity(
      deps,
      makeRawEntity(content),
      {
        content,
        entityType: "note",
        metadata: { title: "Note" },
        visibility: "public",
      },
      "note/note-1.md",
      result,
    );

    expect(deps.entityService.upsertEntity).toHaveBeenCalledWith({
      entity: expect.objectContaining({ visibility: "public" }),
    });
  });
});
