import { describe, it, expect, mock, spyOn, type Mock } from "bun:test";
import {
  persistImportEntity,
  type ImportPersistenceDeps,
} from "../src/lib/import-persistence";
import { createSilentLogger } from "@brains/test-utils";
import { computeContentHash } from "@brains/utils/hash";
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

/**
 * Mirrors what entityService.deserializeEntity returns: `visibility` is
 * present only when the file actually carried the frontmatter key.
 */
function makeParsedEntity(
  visibility?: BaseEntity["visibility"],
  content = "# Note\n\nUpdated body.",
): Partial<BaseEntity> {
  return {
    content,
    entityType: "note",
    metadata: { title: "Note" },
    ...(visibility && { visibility }),
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

/**
 * The deps with upsertEntity still typed as the spy it is.
 *
 * Declaring the builder's result as plain ImportPersistenceDeps erased that,
 * so reading a captured entity back meant asserting the member had a .mock.
 */
type MockImportPersistenceDeps = ImportPersistenceDeps & {
  entityService: ImportPersistenceDeps["entityService"] & {
    upsertEntity: Mock<
      (request: { entity: BaseEntity }) => Promise<{ jobId: string }>
    >;
  };
};

function createMockDeps(
  existing: BaseEntity | null = null,
): MockImportPersistenceDeps {
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
      // Stands in for the canonical serialization, which re-adds the
      // visibility frontmatter the file on disk may be missing.
      serializeEntity: (entity: BaseEntity) =>
        `canonical:${entity.visibility}:${entity.content}`,
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

function upsertedEntity(deps: MockImportPersistenceDeps): BaseEntity {
  const call = deps.entityService.upsertEntity.mock.calls[0];
  if (!call) throw new Error("upsertEntity was not called");
  return call[0].entity;
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
      makeParsedEntity(),
      "note/note-1.md",
      result,
    );

    expect(upsertedEntity(deps).visibility).toBe("restricted");
  });

  it("allows explicit visibility frontmatter to change existing visibility", async () => {
    const deps = createMockDeps(makeExistingEntity("restricted"));
    const result = createImportResult();
    const content = "---\nvisibility: public\n---\n# Note\n\nUpdated body.";

    await persistImportEntity(
      deps,
      makeRawEntity(content),
      makeParsedEntity("public", content),
      "note/note-1.md",
      result,
    );

    expect(upsertedEntity(deps).visibility).toBe("public");
  });

  it("defaults a brand new entity to public when the file omits visibility", async () => {
    const deps = createMockDeps(null);
    const result = createImportResult();

    await persistImportEntity(
      deps,
      makeRawEntity(),
      makeParsedEntity(),
      "note/note-1.md",
      result,
    );

    expect(upsertedEntity(deps).visibility).toBe("public");
  });

  it("honours explicit visibility on a brand new entity", async () => {
    const deps = createMockDeps(null);
    const result = createImportResult();
    const content = "---\nvisibility: restricted\n---\n# Note\n\nBody.";

    await persistImportEntity(
      deps,
      makeRawEntity(content),
      makeParsedEntity("restricted", content),
      "note/note-1.md",
      result,
    );

    expect(upsertedEntity(deps).visibility).toBe("restricted");
  });

  it("logs when the file's visibility is overridden by the stored value", async () => {
    const deps = createMockDeps(makeExistingEntity("restricted"));
    const debug = spyOn(deps.logger, "debug");
    const result = createImportResult();

    await persistImportEntity(
      deps,
      makeRawEntity("# Note\n\nUpdated body."),
      makeParsedEntity(),
      "note/note-1.md",
      result,
    );

    const logged = debug.mock.calls.find(
      ([message]) => typeof message === "string" && /visibility/i.test(message),
    );
    expect(logged).toBeDefined();
    expect(logged?.[1]).toMatchObject({
      path: "note/note-1.md",
      retained: "restricted",
    });
  });

  it("does not log an override when the file and the stored value agree", async () => {
    const deps = createMockDeps(makeExistingEntity("public"));
    const debug = spyOn(deps.logger, "debug");
    const result = createImportResult();

    await persistImportEntity(
      deps,
      makeRawEntity(),
      makeParsedEntity(),
      "note/note-1.md",
      result,
    );

    const logged = debug.mock.calls.find(
      ([message]) => typeof message === "string" && /visibility/i.test(message),
    );
    expect(logged).toBeUndefined();
  });

  // The stored hash is the canonical serialization, not the bytes on disk.
  // That mismatch is deliberate: auto-sync rewrites the file with the
  // preserved visibility, after which the file hash matches and the entity
  // stops re-importing on every scan.
  it("stores the canonical content hash so auto-sync converges", async () => {
    const deps = createMockDeps(makeExistingEntity("restricted"));
    const result = createImportResult();
    const fileContent = "# Note\n\nUpdated body.";

    await persistImportEntity(
      deps,
      makeRawEntity(fileContent),
      makeParsedEntity(),
      "note/note-1.md",
      result,
    );

    const entity = upsertedEntity(deps);
    expect(entity.contentHash).toBe(
      computeContentHash(`canonical:restricted:${fileContent}`),
    );
    expect(entity.contentHash).not.toBe(computeContentHash(fileContent));
  });
});
