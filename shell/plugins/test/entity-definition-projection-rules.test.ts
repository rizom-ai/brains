import { describe, expect, it } from "bun:test";
import type { BaseEntity } from "@brains/entity-service";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createPluginHarness } from "../src/test/harness";
import {
  createTemplate,
  defineEntity,
  defineEntityPackage,
  defineProjectionRule,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
  type ProjectionExecutionContext,
  type ProjectionInputContext,
  type ProjectionRule,
} from "../src";

const digestMetadata = z.object({ count: z.number() });

function countRule(
  seen: {
    input?: ProjectionInputContext;
    execution?: ProjectionExecutionContext;
    template?: string | undefined;
  } = {},
  template?: string,
): ProjectionRule {
  return defineProjectionRule({
    id: "note-count",
    version: "1",
    sources: [{ kind: "entity", types: ["note"] }],
    targetType: "digest",
    inputSchema: z.object({ count: z.number() }),
    selectInput: async (_trigger, context) => {
      seen.input = context;
      const notes = await context.entities.listEntities({ entityType: "note" });
      return { count: notes.length };
    },
    derive: async (input, context) => {
      seen.execution = context;
      seen.template = template;
      return [
        {
          operation: "upsert",
          entity: {
            id: "notes",
            entityType: "digest",
            content: "",
            metadata: { count: input.count },
            visibility: "public",
          },
        },
      ];
    },
  });
}

function digest(
  projectionRules: NonNullable<AnyEntityDefinition["projectionRules"]>,
): AnyEntityDefinition {
  return defineEntity({
    type: "digest",
    purpose: "A count derived from notes.",
    metadata: digestMetadata,
    templates: {
      summary: createTemplate({
        name: "summary",
        description: "Summarizes notes",
        schema: z.object({ body: z.string() }),
        basePrompt: "Summarize.",
        requiredPermission: "public",
      }),
    },
    projectionRules,
  });
}

async function installedRules(
  definition: AnyEntityDefinition,
): Promise<readonly ProjectionRule[]> {
  const [plugin] = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "digests", entities: [definition] }),
    {},
    { name: "@fixture/digests", version: "0.1.0" },
  );
  if (!plugin) throw new Error("No plugin was instantiated");
  const harness = createPluginHarness({
    logger: createSilentLogger("entity-projection-rules"),
  });
  try {
    const capabilities = await harness.installPlugin(plugin);
    return capabilities.projectionRules ?? [];
  } finally {
    await harness.reset();
  }
}

const trigger = { waveId: "wave", inputs: [] };
const signal = new AbortController().signal;

describe("declared projection rules", () => {
  it("registers the rules a type declares for itself", async () => {
    const rules = await installedRules(digest([countRule()]));
    expect(
      rules.map(({ id, version, targetType }) => [id, version, targetType]),
    ).toEqual([["note-count", "1", "digest"]]);
    expect(Object.isFrozen(rules[0])).toBe(true);
  });

  it("names templates by their local name", async () => {
    const seen: Parameters<typeof countRule>[0] = {};
    const rules = await installedRules(
      digest(({ template }) => [countRule(seen, template("summary"))]),
    );
    const rule = rules[0];
    if (!rule) throw new Error("No rule registered");
    await rule.derive({ count: 1 }, executionContext(), signal);
    expect(seen.template).toBe("@fixture/digests:digest:summary");
  });

  it("refuses a template the type does not declare", async () => {
    const outcome = await installedRules(
      digest(({ template }) => [countRule({}, template("missing"))]),
    ).catch((error: unknown) => error);
    expect(String(outcome)).toContain('declares no template named "missing"');
  });

  it("refuses a rule that writes another type", () => {
    const foreign = defineProjectionRule({
      id: "foreign",
      version: "1",
      sources: [{ kind: "entity", types: ["note"] }],
      targetType: "note",
      inputSchema: z.object({}),
      selectInput: async () => ({}),
      derive: async () => [],
    });
    expect(() =>
      instantiatePluginPackageDefinition(
        defineEntityPackage({ id: "digests", entities: [digest([foreign])] }),
        {},
        { name: "@fixture/digests", version: "0.1.0" },
      ),
    ).toThrow('Projection rule "foreign" on digest writes note');
  });

  it("gives a rule reads and generation, never the services behind them", async () => {
    const seen: Parameters<typeof countRule>[0] = {};
    const rules = await installedRules(digest([countRule(seen)]));
    const rule = rules[0];
    if (!rule) throw new Error("No rule registered");

    expect(await rule.selectInput(trigger, inputContext(), signal)).toEqual({
      count: 2,
    });
    expect(Object.isFrozen(seen.input)).toBe(true);
    expect(Object.keys(seen.input?.entities ?? {}).sort()).toEqual([
      "getEntity",
      "getEntityTypeConfig",
      "getEntityTypes",
      "hasEntityType",
      "isProjectionOwnedEntity",
      "listEntities",
    ]);

    await rule.derive({ count: 2 }, executionContext(), signal);
    expect(Object.isFrozen(seen.execution)).toBe(true);
    expect(Object.keys(seen.execution?.ai ?? {}).sort()).toEqual([
      "generate",
      "generateObject",
    ]);
  });
});

function note(id: string): BaseEntity {
  return {
    id,
    entityType: "note",
    content: "",
    contentHash: "h",
    visibility: "public",
    metadata: {},
    created: "2026-01-01T00:00:00.000Z",
    updated: "2026-01-01T00:00:00.000Z",
  };
}

/** A runtime context whose services carry more than a rule may reach. */
function inputContext(): ProjectionInputContext {
  const service = {
    getEntity: async (): Promise<null> => null,
    listEntities: async (): Promise<never[]> => [],
    getEntityTypes: (): string[] => ["note"],
    hasEntityType: (): boolean => true,
    getEntityTypeConfig: (): Record<string, never> => ({}),
    isProjectionOwnedEntity: async (): Promise<boolean> => false,
    deleteEntity: async (): Promise<never> => {
      throw new Error("A rule reached a write");
    },
  };
  return {
    entities: {
      ...service,
      listEntities: async (): Promise<BaseEntity[]> => [note("a"), note("b")],
    },
    resolvePrompt: async (_reference, fallback) => fallback,
    appInfo: async (): Promise<never> => {
      throw new Error("unused");
    },
    identityInput: () => ({ brainName: "Reader" }),
  };
}

function executionContext(): ProjectionExecutionContext {
  const ai = {
    generate: async <T>(): Promise<T> => {
      throw new Error("unused");
    },
    generateObject: async <T>(): Promise<{ object: T }> => {
      throw new Error("unused");
    },
    query: async (): Promise<never> => {
      throw new Error("A rule reached the agent");
    },
  };
  return { ai, logger: createSilentLogger("rule") };
}
