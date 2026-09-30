import { describe, it, expect, mock, spyOn, type Mock } from "bun:test";
import {
  persistImportEntity,
  type ImportPersistenceDeps,
} from "../src/lib/import-persistence";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "@brains/plugins/test";
import {
  EntityWriteConflictError,
  type BaseEntity,
  type EntityServiceClient,
} from "@brains/plugins";
import { computeContentHash } from "@brains/utils/hash";
import type { ImportResult, RawEntity } from "../src/types";

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
function setup(existing: BaseEntity | null = null): {
  deps: ImportPersistenceDeps;
  upsert: Mock<EntityServiceClient["upsertEntity"]>;
  result: ImportResult;
  entity(): BaseEntity;
  importFile(
    visibility?: BaseEntity["visibility"],
    content?: string,
  ): Promise<void>;
} {
  const entityService = createMockShell().getEntityService();
  const upsert = spyOn(entityService, "upsertEntity");
  spyOn(entityService, "serializeEntity").mockImplementation(
    (entity) => `canonical:${entity.visibility}:${entity.content}`,
  );
  const deps = {
    entityService,
    logger: createSilentLogger(),
    quarantine: {
      isValidationError: (): boolean => false,
      quarantineInvalidFile: mock(async (): Promise<void> => {}),
      markAsRecoveredIfNeeded: mock(async (): Promise<void> => {}),
    },
    imageJobQueue: { syncPath: "/tmp/sync" },
    maxAssetImportBytes: 25 * 1024 * 1024,
  };
  const snapshot = existing
    ? { entity: existing, revision: "observed-revision" }
    : null;
  const result: ImportResult = {
    imported: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    quarantinedFiles: [],
    errors: [],
    jobIds: [],
  };
  const importFile = async (
    visibility?: BaseEntity["visibility"],
    content = "# Note\n\nUpdated body.",
  ): Promise<void> => {
    const raw: RawEntity = {
      entityType: "note",
      id: "note-1",
      content,
      created: new Date("2026-01-01T00:00:00Z"),
      updated: new Date("2026-01-02T00:00:00Z"),
    };
    await persistImportEntity(
      deps,
      raw,
      {
        entityType: "note",
        content,
        metadata: { title: "Note" },
        ...(visibility && { visibility }),
      },
      "note/note-1.md",
      result,
      snapshot,
    );
  };
  return {
    deps,
    upsert,
    result,
    importFile,
    entity: (): BaseEntity => {
      const call = upsert.mock.calls[0];
      if (!call) throw new Error("Import did not persist");
      return call[0].entity;
    },
  };
}

describe("persistImportEntity authority", () => {
  it("persists an admitted metadata-only import without a second content-only skip", async () => {
    const existing = makeExistingEntity();
    const f = setup(existing);
    await f.importFile(undefined, existing.content);
    expect(f.entity().metadata).toEqual({ title: "Note" });
    expect(f.result.imported).toBe(1);
  });
  it("creates only while the admitted destination is absent", async () => {
    const f = setup();
    await f.importFile();
    expect(f.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          persistenceOrigin: "directory-sync",
          conditionalWrite: { expectedRevision: null },
        },
      }),
    );
  });
  it("updates only the admitted full revision", async () => {
    const f = setup(makeExistingEntity());
    await f.importFile();
    expect(f.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          persistenceOrigin: "directory-sync",
          conditionalWrite: { expectedRevision: "observed-revision" },
        },
      }),
    );
  });
  for (const existing of [null, makeExistingEntity()]) {
    it(`skips a concurrent ${existing ? "edit/delete" : "create"} without refreshing the condition or quarantining source`, async () => {
      const f = setup(existing);
      f.upsert.mockRejectedValue(
        new EntityWriteConflictError("note", "note-1"),
      );
      await f.importFile();
      expect(f.upsert).toHaveBeenCalledTimes(1);
      expect(f.result).toMatchObject({
        imported: 0,
        skipped: 1,
        failed: 0,
        quarantined: 0,
        jobIds: [],
        issues: [
          {
            path: "note/note-1.md",
            message: expect.stringContaining("Skipped stale import"),
          },
        ],
      });
      expect(f.deps.quarantine.quarantineInvalidFile).not.toHaveBeenCalled();
      expect(f.deps.quarantine.markAsRecoveredIfNeeded).not.toHaveBeenCalled();
    });
  }
});

describe("persistImportEntity visibility", () => {
  it("preserves existing restricted visibility when imported markdown omits visibility", async () => {
    const f = setup(makeExistingEntity());
    await f.importFile();
    expect(f.entity().visibility).toBe("restricted");
  });
  it("allows explicit visibility frontmatter to change existing visibility", async () => {
    const f = setup(makeExistingEntity());
    await f.importFile(
      "public",
      "---\nvisibility: public\n---\n# Note\n\nUpdated body.",
    );
    expect(f.entity().visibility).toBe("public");
  });
  it("defaults a brand new entity to public when the file omits visibility", async () => {
    const f = setup();
    await f.importFile();
    expect(f.entity().visibility).toBe("public");
  });
  it("honours explicit visibility on a brand new entity", async () => {
    const f = setup();
    await f.importFile("restricted");
    expect(f.entity().visibility).toBe("restricted");
  });
  it("logs when the file's visibility is overridden by the stored value", async () => {
    const f = setup(makeExistingEntity());
    const debug = spyOn(f.deps.logger, "debug");
    await f.importFile();
    expect(debug).toHaveBeenCalledWith(
      "Retained stored visibility; imported file declared none",
      {
        path: "note/note-1.md",
        entityType: "note",
        id: "note-1",
        retained: "restricted",
      },
    );
  });
  it("does not log an override when the file and stored value agree", async () => {
    const f = setup(makeExistingEntity("public"));
    const debug = spyOn(f.deps.logger, "debug");
    await f.importFile();
    expect(
      debug.mock.calls.some(
        ([message]) =>
          typeof message === "string" && /visibility/i.test(message),
      ),
    ).toBe(false);
  });
  it("stores the canonical content hash so auto-sync converges", async () => {
    const f = setup(makeExistingEntity());
    const content = "# Note\n\nUpdated body.";
    await f.importFile(undefined, content);
    const hash = f.entity().contentHash;
    expect(hash).toBe(computeContentHash(`canonical:restricted:${content}`));
    expect(hash).not.toBe(computeContentHash(content));
  });
});
