import { afterEach, describe, expect, it } from "bun:test";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { baseEntitySchema, type BaseEntity } from "@brains/entity-service";
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

    expect(batch.rootJobId).toBe("sweep-1");
    expect(written).toBe("done");
    expect(mirror.getEntityTypes()).toContain("note");
    expect(
      (await mirror.getEntity({ entityType: "note", id: "note-3" }))?.content,
    ).toBe("Imported");
  });
});
