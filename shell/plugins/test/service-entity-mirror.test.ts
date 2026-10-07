import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  baseEntitySchema,
  EntityValidationError,
  type BaseEntity,
} from "@brains/entity-service";
import {
  defineServicePlugin,
  infrastructure,
  instantiatePluginPackageDefinition,
  type EntityAdapter,
  type EntityMirror,
} from "../src";
import { createPluginHarness } from "../src/test/harness";

/** A type somebody else declared; the mirror declares none. */
function noteAdapter(): EntityAdapter<BaseEntity> {
  return {
    entityType: "note",
    schema: baseEntitySchema,
    purpose: "A note somebody wrote.",
    fromMarkdown: (markdown: string) => ({ content: markdown }),
    toMarkdown: (entity: BaseEntity) => entity.content,
    extractMetadata: () => ({}),
    parseFrontMatter: <T>(_markdown: string, schema: z.ZodSchema<T>): T =>
      schema.parse({}),
    generateFrontMatter: () => "",
    getBodyTemplate: () => "",
  };
}

/**
 * The brain's records as a mirror keeps them: every type, read and written
 * as the file says, with the export ledger the mirror drains and the bulk
 * coordination its sweeps run under. A package's own entity access is scoped
 * to the types it declares; a mirror declares none and writes every one.
 * Named consumer: @brains/directory-sync.
 */
describe("the records as a mirror keeps them", () => {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-mirror-test"),
  });

  afterEach(async () => {
    await harness.reset();
  });

  async function install(): Promise<EntityMirror> {
    harness
      .getEntityRegistry()
      .registerEntityType("note", baseEntitySchema, noteAdapter());
    let captured: EntityMirror | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin({
        id: "directory-sync",
        config: z.object({}),
        infrastructure,
        setup: ({ infrastructure: facts }) => {
          captured = facts.entityMirror;
          return {};
        },
      }),
      {},
      { name: "@fixture/directory-sync", version: "0.1.0" },
    );
    if (!plugin) throw new Error("Service plugin was not created");
    await harness.installPlugin(plugin);
    if (!captured) throw new Error("setup did not run");
    return captured;
  }

  it("writes a type it did not declare, as the file says", async () => {
    const mirror = await install();
    expect(mirror.hasEntityType("note")).toBe(true);

    await mirror.createEntity({
      entity: {
        id: "note-1",
        entityType: "note",
        content: "# Hello\n\nFrom a file.",
        metadata: {},
      },
    });
    const stored = await mirror.getEntity({ entityType: "note", id: "note-1" });
    if (!stored) throw new Error("The note was not stored");
    expect(stored.content).toBe("# Hello\n\nFrom a file.");

    await mirror.upsertEntity({
      entity: { ...stored, content: "# Hello\n\nEdited on disk." },
    });
    expect(
      (await mirror.listEntities({ entityType: "note" })).map(
        (entity) => entity.content,
      ),
    ).toEqual(["# Hello\n\nEdited on disk."]);

    expect(
      await mirror.deleteEntity({ entityType: "note", id: "note-1" }),
    ).toBe(true);
    expect(await mirror.listEntities({ entityType: "note" })).toEqual([]);
  });

  it("reads unexpanded source for exports, including the schema overload", async () => {
    const mirror = await install();
    const content = "![Literal](entity://image/private)";
    await mirror.createEntity({
      entity: {
        id: "literal",
        entityType: "note",
        content,
        metadata: {},
        visibility: "shared",
      },
    });
    const service = harness.getEntityService();
    const rendered = spyOn(service, "getEntity").mockRejectedValue(
      new Error("Must not render mirror reads"),
    );
    const raw = spyOn(service, "getEntityRaw");
    try {
      const request = {
        entityType: "note",
        id: "literal",
        visibilityScope: "shared" as const,
      };
      expect((await mirror.getEntity(request))?.content).toBe(content);
      expect((await mirror.getEntity(request, baseEntitySchema))?.content).toBe(
        content,
      );
      expect(raw).toHaveBeenCalledWith(request);
      expect(raw).toHaveBeenCalledWith(request, baseEntitySchema);
      expect(rendered).not.toHaveBeenCalled();
    } finally {
      rendered.mockRestore();
      raw.mockRestore();
    }
  });

  it("returns detached, scoped source snapshots rather than rendered content", async () => {
    const mirror = await install();
    const content = "![Literal](entity://image/private)";
    await mirror.createEntity({
      entity: {
        id: "snapshot",
        entityType: "note",
        content,
        metadata: { title: "Original" },
        visibility: "restricted",
      },
    });
    expect(
      await mirror.getEntityWriteSnapshot({
        entityType: "note",
        id: "snapshot",
      }),
    ).toBeNull();
    const request = {
      entityType: "note",
      id: "snapshot",
      visibilityScope: "restricted" as const,
    };
    const snapshot = await mirror.getEntityWriteSnapshot(request);
    if (!snapshot) throw new Error("Expected source snapshot");
    expect(snapshot.entity.content).toBe(content);
    expect(snapshot.revision.length).toBeGreaterThan(0);
    snapshot.entity.content = "Changed outside storage";
    snapshot.entity.metadata["title"] = "Changed outside storage";
    const reread = await mirror.getEntityWriteSnapshot(request);
    expect(reread?.entity.content).toBe(content);
    expect(reread?.entity.metadata["title"]).toBeUndefined();
  });

  it("fences conditional imports against edits, deletions and raced creation", async () => {
    const mirror = await install();
    const entity: BaseEntity = {
      id: "conditional",
      entityType: "note",
      content: "Original",
      metadata: {},
      visibility: "public",
      contentHash: "original",
      created: "2026-07-01T00:00:00.000Z",
      updated: "2026-07-01T00:00:00.000Z",
    };
    expect(
      (
        await mirror.upsertEntity({
          entity,
          options: { conditionalWrite: { expectedRevision: null } },
        })
      ).created,
    ).toBe(true);
    const request = { entityType: "note", id: "conditional" };
    const snapshot = await mirror.getEntityWriteSnapshot(request);
    if (!snapshot) throw new Error("Expected source snapshot");
    const [creation] = await Promise.allSettled([
      mirror.upsertEntity({
        entity,
        options: { conditionalWrite: { expectedRevision: null } },
      }),
    ]);
    expect(creation).toMatchObject({
      status: "rejected",
      reason: { code: "conflict" },
    });
    expect(
      (
        await mirror.upsertEntity({
          entity: { ...snapshot.entity, content: "Concurrent edit" },
          options: {
            conditionalWrite: { expectedRevision: snapshot.revision },
          },
        })
      ).created,
    ).toBe(false);
    const stale = {
      entity: { ...snapshot.entity, content: "Stale file" },
      options: { conditionalWrite: { expectedRevision: snapshot.revision } },
    };
    const [edit] = await Promise.allSettled([mirror.upsertEntity(stale)]);
    expect(edit).toMatchObject({
      status: "rejected",
      reason: { code: "conflict" },
    });
    expect((await mirror.getEntity(request))?.content).toBe("Concurrent edit");
    await mirror.deleteEntity(request);
    const [deletion] = await Promise.allSettled([mirror.upsertEntity(stale)]);
    expect(deletion).toMatchObject({
      status: "rejected",
      reason: { code: "conflict" },
    });
    expect(await mirror.getEntity(request)).toBeNull();
  });

  it("sanitizes snapshot and upsert failures at the mirror boundary", async () => {
    const mirror = await install();
    const service = harness.getEntityService();
    const read = spyOn(service, "getEntityWriteSnapshot").mockRejectedValue(
      new Error("private database source"),
    );
    const write = spyOn(service, "upsertEntity").mockRejectedValue(
      new Error("private filesystem source"),
    );
    try {
      const results = await Promise.allSettled([
        mirror.getEntityWriteSnapshot({ entityType: "note", id: "missing" }),
        mirror.upsertEntity({
          entity: {
            id: "missing",
            entityType: "note",
            content: "Body",
            metadata: {},
            visibility: "public",
            contentHash: "body",
            created: "2026-07-01T00:00:00.000Z",
            updated: "2026-07-01T00:00:00.000Z",
          },
        }),
      ]);
      for (const result of results) {
        expect(result).toMatchObject({
          status: "rejected",
          reason: { code: "handler_failed" },
        });
        expect(JSON.stringify(result)).not.toContain("private");
      }
    } finally {
      read.mockRestore();
      write.mockRestore();
    }
  });

  it.each(["schema", "persist"] as const)(
    "retains only sanitized %s-phase failure classification",
    async (phase) => {
      const mirror = await install();
      const write = spyOn(
        harness.getEntityService(),
        "upsertEntity",
      ).mockRejectedValue(
        new EntityValidationError(
          "note",
          new Error("PRIVATE_SOURCE_MARKER"),
          phase,
        ),
      );
      try {
        const error = await mirror
          .upsertEntity({
            entity: {
              id: "refused",
              entityType: "note",
              content: "Body",
              metadata: {},
              visibility: "public",
              contentHash: "hash",
              created: "2026-07-01T00:00:00.000Z",
              updated: "2026-07-01T00:00:00.000Z",
            },
          })
          .catch((failure: unknown) => failure);
        expect(error).toMatchObject({
          code: phase === "schema" ? "invalid_input" : "handler_failed",
        });
        expect(JSON.stringify(error)).not.toContain("PRIVATE_SOURCE_MARKER");
      } finally {
        write.mockRestore();
      }
    },
  );

  it("serialises through the type's own adapter, both ways", async () => {
    const mirror = await install();
    const entity: BaseEntity = {
      id: "note-2",
      entityType: "note",
      content: "Body on disk",
      metadata: {},
      visibility: "public",
      contentHash: "note-2-hash",
      created: "2026-07-01T00:00:00.000Z",
      updated: "2026-07-01T00:00:00.000Z",
    };

    const markdown = mirror.serializeEntity(entity);

    expect(typeof markdown).toBe("string");
    expect(mirror.deserializeEntity(markdown, "note")).toMatchObject({
      content: expect.any(String),
    });
  });

  it("holds the export ledger and the coordination a sweep runs under", async () => {
    const mirror = await install();
    expect(await mirror.hasPendingEntityExports()).toBe(false);
    const bulk = spyOn(harness.getEntityService(), "runBulkMutation");

    const batch = await mirror.coordination.beginDurableBulkMutation({
      rootJobId: "sweep-1",
      expectedChildren: 1,
    });
    const child = batch.childRef("0:import");
    const written = await mirror.coordination.runDurableBulkMutationChild(
      child,
      "job-1",
      () =>
        mirror.runBulkMutation(
          { source: "import", operationId: "sweep-1" },
          async () => {
            await mirror.createEntity({
              entity: {
                id: "note-3",
                entityType: "note",
                content: "Imported",
                metadata: {},
              },
            });
            return "done";
          },
        ),
    );

    expect(bulk).toHaveBeenCalledWith(
      {
        source: "@fixture/directory-sync:directory-sync",
        operationId: "sweep-1",
      },
      expect.any(Function),
    );
    expect(batch.rootJobId).toBe("sweep-1");
    expect(written).toBe("done");
    expect(mirror.getEntityTypes()).toContain("note");
    expect(
      (await mirror.getEntity({ entityType: "note", id: "note-3" }))?.content,
    ).toBe("Imported");
  });
});
