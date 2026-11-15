import { describe, expect, expectTypeOf, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { EntityRegistry, type BaseEntity } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import { createMockShell } from "../src/test/mock-shell";
import {
  createEntityPackagePlugins,
  parseDefinitionEntity,
} from "../src/entity/declarative-entity-plugin";
import {
  SYSTEM_CHANNELS,
  defineEntity,
  entityDisplayTitle,
  type AnyEntityDefinition,
  type EntityDefinitionConfig,
  type EntitySeedDefinition,
} from "../src";

const stored = {
  id: "one",
  content: "Body",
  visibility: "public",
  contentHash: "hash",
  created: "2026-01-01T00:00:00.000Z",
  updated: "2026-01-01T00:00:00.000Z",
} as const;

type DeclarativeEntityPlugin = ReturnType<
  typeof createEntityPackagePlugins
>[number];

function pluginFor(definition: AnyEntityDefinition): DeclarativeEntityPlugin {
  const [plugin] = createEntityPackagePlugins(
    [definition],
    [],
    { name: "@fixture/basics", version: "0.1.0" },
    (id) => `@fixture/basics:${id}`,
  );
  if (!plugin) throw new Error("Entity plugin was not created");
  return plugin;
}

async function installed(
  definition: AnyEntityDefinition,
): Promise<ReturnType<typeof createPluginHarness>> {
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-basics"),
  });
  await harness.installPlugin(pluginFor(definition));
  return harness;
}

describe("declared entity-type config", () => {
  it("registers every declared flag with the entity registry", async () => {
    const harness = await installed(
      defineEntity({
        type: "configured",
        purpose: "Declares every entity-type flag.",
        metadata: z.object({ status: z.string().optional() }),
        config: {
          weight: 0.5,
          embeddable: false,
          fullTextSearchable: false,
          includeInBroadSearch: false,
          binaryStorage: "asset",
          defaultSort: [
            { field: "publishedAt", direction: "desc", nullsLast: true },
          ],
          markdownImport: true,
          retiredFields: ["legacyTitle"],
          translatedFields: ["legacySummary"],
          actionPolicy: { delete: "admin" },
          projectionSource: false,
          projectionSourceRole: "excluded",
          publish: { publishStatuses: ["published"] },
        },
      }),
    );
    try {
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("configured"),
      ).toEqual({
        classification: "content",
        weight: 0.5,
        embeddable: false,
        fullTextSearchable: false,
        includeInBroadSearch: false,
        binaryStorage: "asset",
        defaultSort: [
          { field: "publishedAt", direction: "desc", nullsLast: true },
        ],
        markdownImport: true,
        retiredFields: ["legacyTitle"],
        translatedFields: ["legacySummary"],
        actionPolicy: { delete: "admin" },
        projectionSource: false,
        projectionSourceRole: "excluded",
        publish: { publishStatuses: ["published"] },
      });
    } finally {
      await harness.reset();
    }
  });

  it("names the container a contained type lives in", async () => {
    const harness = await installed(
      defineEntity({
        type: "chapter",
        purpose: "A part of a book.",
        metadata: z.object({}),
        config: { containedIn: "book" },
      }),
    );
    try {
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("chapter").containedIn,
      ).toBe("book");
    } finally {
      await harness.reset();
    }
  });

  it("registers no overrides when config is not declared", async () => {
    const harness = await installed(
      defineEntity({
        type: "plain",
        purpose: "Takes the runtime defaults.",
        metadata: z.object({}),
      }),
    );
    try {
      expect(harness.getEntityRegistry().getEntityTypeConfig("plain")).toEqual({
        classification: "content",
      });
    } finally {
      await harness.reset();
    }
  });

  it("detaches nested declaration data from the author's object", async () => {
    const config = {
      defaultSort: [{ field: "rank", direction: "asc" as const }],
      publish: { publishStatuses: ["approved"] },
    } satisfies EntityDefinitionConfig;
    const plugin = pluginFor(
      defineEntity({
        type: "detached",
        purpose: "Its config is copied when installed.",
        metadata: z.object({}),
        config,
      }),
    );
    config.defaultSort[0] = { field: "changed", direction: "asc" };
    config.publish.publishStatuses.push("draft");
    const harness = createPluginHarness();
    try {
      await harness.installPlugin(plugin);
      expect(
        harness.getEntityRegistry().getEntityTypeConfig("detached"),
      ).toMatchObject({
        defaultSort: [{ field: "rank", direction: "asc" }],
        publish: { publishStatuses: ["approved"] },
      });
    } finally {
      await harness.reset();
    }
  });

  for (const invalid of [
    { classification: "system" },
    { binaryStorage: "unknown" },
    { markdownImport: "true" },
    { includeInBroadSearch: "false" },
    { weight: "heavy" },
    { actionPolicy: { create: "sometimes" } },
    { actionPolicy: { approve: "admin" } },
    { retiredFields: [""] },
    { containedIn: "" },
    { projectionSourceRole: "central" },
    { defaultSort: [{ field: "rank", direction: "asc", nullsLast: "true" }] },
    { defaultSort: [{ field: "", direction: "desc" }] },
    { defaultSort: [{ field: "a".repeat(101), direction: "desc" }] },
    { defaultSort: [{ field: "created", direction: "sideways" }] },
    { defaultSort: [{ field: "created", direction: "desc", handler: "raw" }] },
    {
      defaultSort: Array.from({ length: 11 }, () => ({
        field: "created",
        direction: "desc",
      })),
    },
  ]) {
    it(`rejects a malformed declaration: ${JSON.stringify(invalid).slice(0, 80)}`, () => {
      const config: EntityDefinitionConfig = {};
      Object.assign(config, invalid);
      expect(() =>
        pluginFor(
          defineEntity({
            type: "malformed",
            purpose: "Declares a flag the runtime refuses.",
            metadata: z.object({}),
            config,
          }),
        ),
      ).toThrow();
    });
  }
});

describe("declared metadata migration", () => {
  const memory = defineEntity({
    type: "memory",
    purpose: "A thing recalled, attributed to whoever said it.",
    metadata: z.object({ said_by: z.string() }),
    displayTitle: ({ metadata }) => metadata.said_by,
    metadataFrom: (value) =>
      typeof value === "object" &&
      value !== null &&
      "actorId" in value &&
      typeof value.actorId === "string"
        ? { said_by: value.actorId }
        : value,
  });

  it("migrates stored metadata in the schema every write validates against", () => {
    const parsed = pluginFor(memory).schema.parse({
      ...stored,
      entityType: "memory",
      metadata: { actorId: "alice" },
    });
    expect(parsed.metadata).toEqual({ said_by: "alice" });
  });

  it("migrates for the display label without rewriting the record", async () => {
    const harness = await installed(memory);
    try {
      const legacy: BaseEntity = {
        ...stored,
        entityType: "memory",
        metadata: { actorId: "alice" },
      };
      const before = structuredClone(legacy);
      const adapter = harness.getEntityRegistry().getAdapter("memory");
      expect(adapter.displayTitle?.(legacy)).toBe("alice");
      expect(adapter.extractMetadata(legacy)).toEqual(before.metadata);
      expect(legacy).toEqual(before);
    } finally {
      await harness.reset();
    }
  });

  it("migrates metadata a file still carries in its old shape", () => {
    expect(
      pluginFor(memory).adapter.fromMarkdown(
        "---\nactorId: alice\n---\nWe agreed on Tuesday.",
      ),
    ).toEqual({
      content: "We agreed on Tuesday.",
      metadata: { said_by: "alice" },
    });
  });

  it("keeps the retired-field guard for a migrated type", async () => {
    const registry = EntityRegistry.createFresh(createSilentLogger());
    const shell = createMockShell({ logger: createSilentLogger() });
    shell.getEntityRegistry = (): EntityRegistry => registry;
    const retiring = defineEntity({
      type: "retiring-memory",
      purpose: "Migrates its metadata and retires a field it still declares.",
      metadata: z.object({ said_by: z.string() }),
      metadataFrom: (value) => value,
      config: { retiredFields: ["said_by"] },
    });

    const refused = await pluginFor(retiring)
      .register(shell)
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(Error);
    expect(String(refused)).toContain(
      "retiring-memory retires said_by, which its metadata schema still declares",
    );
  });

  it("migrates and validates once per typed parse", () => {
    let validations = 0;
    let migrations = 0;
    const counted = defineEntity({
      type: "counted",
      purpose: "Counts its own parses.",
      metadata: z.object({
        priority: z.number().refine(() => {
          validations++;
          return true;
        }),
      }),
      metadataFrom: (value) => {
        migrations++;
        return value;
      },
    });
    const entity = parseDefinitionEntity(counted, {
      ...stored,
      entityType: "counted",
      metadata: { priority: 3 },
    });
    expect(entity.metadata.priority).toBe(3);
    expect(validations).toBe(1);
    expect(migrations).toBe(1);
    expect(() =>
      parseDefinitionEntity(counted, {
        ...stored,
        entityType: "other",
        metadata: { priority: 3 },
      }),
    ).toThrow();
  });
});

describe("declared entity shape", () => {
  const welcome = defineEntity({
    type: "welcome",
    purpose: "The one welcome a brain shows.",
    metadata: z.object({}),
    singleton: true,
    hasBody: false,
    coverImage: true,
  });
  const ordinary = defineEntity({
    type: "ordinary",
    purpose: "Declares none of the shape flags.",
    metadata: z.object({}),
  });

  it("constrains a singleton's record id to its entity type", () => {
    const plugin = pluginFor(welcome);
    const record = { ...stored, entityType: "welcome", metadata: {} };
    expect(plugin.schema.parse({ ...record, id: "welcome" }).id).toBe(
      "welcome",
    );
    expect(() => plugin.schema.parse({ ...record, id: "other" })).toThrow(
      "singleton",
    );
    expect(() =>
      parseDefinitionEntity(welcome, {
        ...stored,
        id: "other",
        entityType: "welcome",
        metadata: {},
      }),
    ).toThrow();
  });

  it("reads a singleton's document as its one record, under the type's id", () => {
    const parsed = pluginFor(welcome).adapter.fromMarkdown("---\n---\n");
    expect(parsed.id).toBe("welcome");
    // Any other type's document names no id; the writer gives it one.
    expect(pluginFor(ordinary).adapter.fromMarkdown("Body").id).toBeUndefined();
  });

  it("reaches the adapter flags Studio and system_update consult", async () => {
    const harness = await installed(welcome);
    try {
      const adapter = harness.getEntityRegistry().getAdapter("welcome");
      expect(adapter.isSingleton).toBe(true);
      expect(adapter.hasBody).toBe(false);
      expect(adapter.supportsCoverImage).toBe(true);
    } finally {
      await harness.reset();
    }
  });

  it("leaves the flags absent for a type that did not declare them", async () => {
    const harness = await installed(ordinary);
    try {
      const adapter = harness.getEntityRegistry().getAdapter("ordinary");
      // Absent, not false: a type that never declared a flag reads the same
      // as one written before the flag existed.
      expect(adapter.isSingleton).toBeUndefined();
      expect(adapter.hasBody).toBeUndefined();
      expect(adapter.supportsCoverImage).toBeUndefined();
      expect(adapter.displayTitle).toBeUndefined();
    } finally {
      await harness.reset();
    }
  });
});

describe("declared display title", () => {
  const note = defineEntity({
    type: "note",
    purpose: "A note titled by its first heading.",
    metadata: z.object({ title: z.string().optional() }),
    displayTitle: ({ content, metadata }) => {
      expectTypeOf(metadata.title).toEqualTypeOf<string | undefined>();
      return metadata.title ?? content.match(/^# (.+)$/mu)?.[1];
    },
  });

  it("names the entity wherever the runtime shows it", async () => {
    const harness = await installed(note);
    try {
      expect(
        entityDisplayTitle(harness.getEntityRegistry(), {
          ...stored,
          entityType: "note",
          content: "# From the heading\n\nBody",
          metadata: {},
        }),
      ).toBe("From the heading");
    } finally {
      await harness.reset();
    }
  });

  it("gives no label for metadata the schema refuses", () => {
    expect(
      pluginFor(note).adapter.displayTitle?.({
        ...stored,
        entityType: "note",
        metadata: { title: 42 },
      }),
    ).toBeUndefined();
  });
});

describe("declared persistence validation", () => {
  const record = defineEntity({
    type: "private-record",
    purpose: "A record that must stay restricted.",
    metadata: z.object({}),
    validatePersist: (entity) => {
      expect(Object.isFrozen(entity)).toBe(true);
      expect(Object.keys(entity).sort()).toEqual(["content", "visibility"]);
      if (entity.visibility !== "restricted") {
        throw new Error("Restricted records only");
      }
    },
  });

  it("registers the invariant with the entity registry", async () => {
    const registry = EntityRegistry.createFresh(createSilentLogger());
    const shell = createMockShell({ logger: createSilentLogger() });
    shell.getEntityRegistry = (): EntityRegistry => registry;
    await pluginFor(record).register(shell);

    const validator = registry.getPersistValidator("private-record");
    if (!validator) throw new Error("Expected a persist validator");
    const entity: BaseEntity = {
      ...stored,
      entityType: "private-record",
      metadata: {},
      visibility: "restricted",
    };
    expect(await validator(entity, { operation: "create" })).toBeUndefined();
    const refused = await validator(
      { ...entity, visibility: "public" },
      { operation: "update" },
    ).catch((error: unknown) => error);
    expect(refused).toEqual(new Error("Restricted records only"));
  });

  it("registers nothing for a type without an invariant", async () => {
    const registry = EntityRegistry.createFresh(createSilentLogger());
    const shell = createMockShell({ logger: createSilentLogger() });
    shell.getEntityRegistry = (): EntityRegistry => registry;
    await pluginFor(
      defineEntity({
        type: "open-record",
        purpose: "Anything goes.",
        metadata: z.object({}),
      }),
    ).register(shell);

    expect(registry.getPersistValidator("open-record")).toBeUndefined();
  });
});

describe("declared action policy", () => {
  it("keys the type's own policy by its bare entity type", () => {
    const plugin = pluginFor(
      defineEntity({
        type: "observation",
        purpose: "What the brain observed, kept as it observed it.",
        metadata: z.object({}),
        actions: {
          create: "never",
          update: "never",
          delete: "admin",
        },
      }),
    );

    expect(plugin.entityActionPolicy).toEqual({
      observation: { create: "never", update: "never", delete: "admin" },
    });
  });

  it("declares no policy when the type follows the baseline", () => {
    expect(
      pluginFor(
        defineEntity({
          type: "baseline",
          purpose: "Follows the platform baseline.",
          metadata: z.object({}),
        }),
      ).entityActionPolicy,
    ).toBeUndefined();
  });

  it("refuses a level the policy vocabulary does not have", () => {
    const actions = {};
    Object.assign(actions, { create: "sometimes" });
    expect(() =>
      pluginFor(
        defineEntity({
          type: "unclear",
          purpose: "Declares a level that does not exist.",
          metadata: z.object({}),
          actions,
        }),
      ),
    ).toThrow();
  });
});

describe("declared seeds", () => {
  let builds = 0;
  const houseStyle = defineEntity({
    type: "house-style",
    purpose: "A singleton the brain needs before anyone edits it.",
    metadata: z.object({ tone: z.string().default("plain") }),
    singleton: true,
    seed: {
      on: "startup-content-settled",
      id: "house-style",
      content: (): string => {
        builds++;
        return "# House style\n\nWrite plainly.";
      },
      metadata: { tone: "warm" },
    },
  });

  function readSeed(
    harness: ReturnType<typeof createPluginHarness>,
  ): Promise<BaseEntity | null> {
    return harness.getEntityService().getEntity({
      entityType: "house-style",
      id: "house-style",
      visibilityScope: "restricted",
    });
  }

  it("does not create the entity before startup content settles", async () => {
    const harness = await installed(houseStyle);
    try {
      expect(await readSeed(harness)).toBeNull();
    } finally {
      await harness.reset();
    }
  });

  it("creates the entity once startup content settles", async () => {
    // Seed metadata is the schema's input, also accepted read-only:
    // defaulted fields may be omitted.
    expectTypeOf<
      NonNullable<EntitySeedDefinition<typeof houseStyle.metadata>["metadata"]>
    >().toEqualTypeOf<
      { tone?: string | undefined } | { readonly tone?: string | undefined }
    >();
    const harness = await installed(houseStyle);
    try {
      await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
      const entity = await readSeed(harness);
      expect(entity).toMatchObject({
        id: "house-style",
        entityType: "house-style",
        metadata: { tone: "warm" },
      });
      expect(entity?.content).toContain("Write plainly.");
    } finally {
      await harness.reset();
    }
  });

  it("does not seed on the raw initial-sync signal", async () => {
    const harness = await installed(houseStyle);
    try {
      await harness.sendMessage(SYSTEM_CHANNELS.initialSyncCompleted, {
        success: true,
      });
      expect(await readSeed(harness)).toBeNull();
    } finally {
      await harness.reset();
    }
  });

  for (const visibility of ["public", "restricted"] as const) {
    it(`leaves an existing ${visibility} entity untouched and unbuilt`, async () => {
      const harness = await installed(houseStyle);
      try {
        await harness.getEntityService().createEntity({
          entity: {
            id: "house-style",
            entityType: "house-style",
            content: "# House style\n\nAuthored by a human.",
            metadata: { tone: "dry" },
            visibility,
          },
        });
        const before = builds;
        await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
        const entity = await readSeed(harness);
        expect(entity?.content).toContain("Authored by a human.");
        expect(entity?.visibility).toBe(visibility);
        expect(builds).toBe(before);
      } finally {
        await harness.reset();
      }
    });
  }

  it("stops listening once the plugin shuts down", async () => {
    const harness = createPluginHarness();
    const plugin = pluginFor(houseStyle);
    try {
      await harness.installPlugin(plugin);
      await plugin.shutdown();
      await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
      expect(await readSeed(harness)).toBeNull();
    } finally {
      await harness.reset();
    }
  });

  it("is inert for an entity that declares no seed", async () => {
    const harness = await installed(
      defineEntity({
        type: "unseeded",
        purpose: "No seed declared.",
        metadata: z.object({}),
      }),
    );
    try {
      await harness.sendMessage(SYSTEM_CHANNELS.startupContentSettled, {});
      expect(
        await harness.getEntityService().getEntity({
          entityType: "unseeded",
          id: "unseeded",
          visibilityScope: "restricted",
        }),
      ).toBeNull();
    } finally {
      await harness.reset();
    }
  });
});
