import { describe, expect, it, spyOn } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { baseEntitySchema, createTestEntityAdapter } from "../test";
import {
  classEntityServiceOf,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type ServiceRuntime,
} from "../src";

/**
 * The entity service a first-party service converted from a class reads
 * and writes through, as its class did through context.entityService: a
 * read parsed by the schema it names, as the entity service parses one,
 * and every write handed on as written. Email triage and the forms engine
 * read and write their records through it.
 */

async function runtimeOn(shell: MockShell): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "probe",
      config: z.object({}),
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell);
  if (!runtime) throw new Error("Setup did not run");
  return runtime;
}

const noteSchema = baseEntitySchema.extend({
  entityType: z.literal("note"),
  metadata: z.object({ title: z.string() }),
});

describe("a converted class's entity service", () => {
  it("parses a read by the schema it names, and hands a write on as written", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "note",
        baseEntitySchema,
        createTestEntityAdapter("note"),
      );
    const entities = classEntityServiceOf(await runtimeOn(shell));

    await entities.createEntity({
      entity: {
        id: "n1",
        entityType: "note",
        content: "One",
        visibility: "public",
        metadata: { title: "One", extra: true },
      },
    });
    await entities.upsertEntity({
      entity: {
        id: "n2",
        entityType: "note",
        content: "Two",
        visibility: "public",
        metadata: { title: "Two" },
        contentHash: "",
        created: "2026-01-01T00:00:00.000Z",
        updated: "2026-01-01T00:00:00.000Z",
      },
    });
    const request = {
      entityType: "note",
      id: "n1",
      visibilityScope: "public" as const,
    };
    const raw = await entities.getEntity(request);
    const parsed = await entities.getEntity(request, noteSchema);
    expect(raw?.metadata).toEqual({ title: "One", extra: true });
    // The schema strips what it does not name, as the entity service's own
    // parse does.
    expect(parsed?.metadata).toEqual({ title: "One" });
    expect(parsed?.entityType).toBe("note");

    const listed = await entities.listEntities(
      {
        entityType: "note",
        options: { filter: { visibilityScope: "public" } },
      },
      noteSchema,
    );
    expect(listed.map(({ id }) => id).sort()).toEqual(["n1", "n2"]);
    expect(
      await entities.countEntities({
        entityType: "note",
        options: { filter: { visibilityScope: "public" } },
      }),
    ).toBe(2);

    if (!raw) throw new Error("Missing note");
    await entities.updateEntity({ entity: { ...raw, content: "One, again" } });
    expect((await entities.getEntity(request))?.content).toBe("One, again");
  });

  it("parses a search hit by the schema it names, and deletes a record", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "note",
        baseEntitySchema,
        createTestEntityAdapter("note"),
      );
    const entities = classEntityServiceOf(await runtimeOn(shell));
    await entities.createEntity({
      entity: {
        id: "n1",
        entityType: "note",
        content: "One",
        visibility: "public",
        metadata: { title: "One", extra: true },
      },
    });

    const search = {
      query: "One",
      options: { types: ["note"], visibilityScope: "public" as const },
    };
    const stored = await entities.getEntity({
      entityType: "note",
      id: "n1",
      visibilityScope: "public",
    });
    if (!stored) throw new Error("Missing note");
    // The fake holds no vectors, so the hit is the one the brain would give.
    spyOn(shell.getEntityService(), "search").mockResolvedValue([
      { entity: stored, score: 0.9, excerpt: "One" },
    ]);
    const [raw] = await entities.search(search);
    const [parsed] = await entities.search(search, noteSchema);
    expect(raw?.entity.metadata).toEqual({ title: "One", extra: true });
    expect(parsed?.entity.metadata).toEqual({ title: "One" });
    expect(parsed?.score).toBe(raw?.score);

    await entities.deleteEntity({ entityType: "note", id: "n1" });
    expect(
      await entities.getEntity({
        entityType: "note",
        id: "n1",
        visibilityScope: "public",
      }),
    ).toBeNull();
  });

  it("reads whether the brain holds a type", async () => {
    const shell = createMockShell();
    shell
      .getEntityRegistry()
      .registerEntityType(
        "note",
        baseEntitySchema,
        createTestEntityAdapter("note"),
      );
    const { entityReads } = await runtimeOn(shell);
    expect(entityReads.hasEntityType("note")).toBe(true);
    expect(entityReads.hasEntityType("deck")).toBe(false);
  });
});
