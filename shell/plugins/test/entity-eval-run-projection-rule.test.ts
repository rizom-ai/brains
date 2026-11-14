import { describe, expect, it } from "bun:test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell } from "../src/test/mock-shell";
import {
  EntityPlugin,
  defineEntity,
  defineEntityPackage,
  defineProjectionRule,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type EvalHandler,
  type ProjectionWaveInput,
  type ProjectionWriteIntent,
} from "../src";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

/**
 * A first-party entity eval measures its type's own projection rule as
 * production runs it, on the same shell run a service's runtime uses: the
 * brain runs the registered rule's select and derive, with no wave, memo
 * or write, and hands back what it would write. Only a rule the declaring
 * type declares is run; any other id, another type's rule in the same
 * package among them, is refused, and nothing but an eval runs one.
 */

function ruleFor(
  id: string,
  targetType: string,
): ReturnType<typeof defineProjectionRule> {
  return defineProjectionRule({
    id,
    version: "1",
    sources: [{ kind: "entity", types: ["topic"] }],
    targetType,
    inputSchema: z.object({}),
    selectInput: async () => ({}),
    derive: async () => [],
  });
}

const intents: readonly ProjectionWriteIntent[] = [
  { operation: "delete", entityType: "assessed", id: "stale" },
];

const inputs: ProjectionWaveInput[] = [
  {
    sourceType: "topic",
    sourceId: "tides",
    revision: "eval",
    operation: "upsert",
  },
];

const ruleOutcome = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    (written) => written,
    (error: unknown) => (error instanceof Error ? error.message : "refused"),
  );

const assessed = defineEntity({
  type: "assessed",
  purpose: "An assessment its eval derives.",
  metadata: z.object({}),
  projectionRules: [ruleFor("assessment-derivation", "assessed")],
  generation: {
    input: z.object({}),
    generate: async (context) => ({
      success: true,
      id: "generated",
      content: String(
        await ruleOutcome(
          entityRuntime(context).runProjectionRule("assessment-derivation"),
        ),
      ),
      metadata: {},
    }),
  },
  evals: {
    generate: async (_input, context) =>
      entityRuntime(context).runGeneration({}),
    derive: async (input, context) =>
      entityRuntime(context).runProjectionRule(
        z.object({ rule: z.string() }).parse(input).rule,
        { inputs },
      ),
    deriveAll: async (_input, context) =>
      entityRuntime(context).runProjectionRule("assessment-derivation"),
  },
});

const other = defineEntity({
  type: "other",
  purpose: "Another type of the same package with a rule of its own.",
  metadata: z.object({}),
  projectionRules: [ruleFor("other-derivation", "other")],
});

async function installed(
  ran: Array<[string, readonly ProjectionWaveInput[] | undefined]>,
): Promise<Map<string, EvalHandler>> {
  const shell = createMockShell();
  shell.runProjectionRule = async (
    ruleId,
    options,
  ): Promise<readonly ProjectionWriteIntent[]> => {
    ran.push([ruleId, options?.inputs]);
    return intents;
  };
  const handlers = new Map<string, EvalHandler>();
  shell.registerEvalHandler = (_pluginId, id, handler): void => {
    handlers.set(id, handler);
  };
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "assessments", entities: [assessed, other] }),
    {},
    { name: "@fixture/assessments", version: "0.1.0" },
  );
  for (const plugin of plugins) await plugin.register(shell);
  return handlers;
}

function handler(handlers: Map<string, EvalHandler>, id: string): EvalHandler {
  const found = handlers.get(id);
  if (!found) throw new Error(`No ${id} eval`);
  return found;
}

describe("a first-party entity eval running its type's projection rule", () => {
  it("hands back what the brain's run of the rule would write", async () => {
    const ran: Array<[string, readonly ProjectionWaveInput[] | undefined]> = [];
    const handlers = await installed(ran);

    expect(
      await handler(handlers, "derive")({ rule: "assessment-derivation" }),
    ).toEqual(intents);
    expect(await handler(handlers, "deriveAll")({})).toEqual(intents);
    expect(ran).toEqual([
      ["assessment-derivation", inputs],
      ["assessment-derivation", undefined],
    ]);
  });

  it("refuses a rule its own type does not declare", async () => {
    const ran: Array<[string, readonly ProjectionWaveInput[] | undefined]> = [];
    const handlers = await installed(ran);
    const derive = handler(handlers, "derive");

    expect(await ruleOutcome(derive({ rule: "other-derivation" }))).toBe(
      'Unknown projection rule "other-derivation" for @fixture/assessments:assessed',
    );
    expect(await ruleOutcome(derive({ rule: "skill-derivation" }))).toBe(
      'Unknown projection rule "skill-derivation" for @fixture/assessments:assessed',
    );
    expect(ran).toEqual([]);
  });

  it("is refused outside an eval", async () => {
    const ran: Array<[string, readonly ProjectionWaveInput[] | undefined]> = [];
    const directory = await createTestDirectory();
    const logger = createSilentLogger("eval-run-projection-rule");
    const registry = EntityRegistry.createFresh(logger);
    const plugins = instantiatePluginPackageDefinition(
      defineEntityPackage({ id: "assessments", entities: [assessed] }),
      {},
      { name: "@fixture/assessments", version: "0.1.0" },
      { pluginId: "assessments" },
    );
    for (const plugin of plugins) {
      if (plugin instanceof EntityPlugin) {
        registry.registerEntityType(
          plugin.entityType,
          plugin.schema,
          plugin.adapter,
        );
      }
    }
    const dbConfig = { url: `file:${directory.dir}/entities.db` };
    await migrateEntities(dbConfig, logger);
    const service = EntityService.createFresh({
      dbConfig,
      embeddingDbConfig: { url: `file:${directory.dir}/embeddings.db` },
      entityRegistry: registry,
      logger,
      jobQueueService: createMockShell().getJobQueueService(),
      embeddingsEnabled: false,
      embeddingService: createRefusingEmbeddingService(),
    });
    await service.initialize();
    try {
      const shell = createMockShell({ logger, entityService: service });
      shell.runProjectionRule = async (
        ruleId,
        options,
      ): Promise<readonly ProjectionWriteIntent[]> => {
        ran.push([ruleId, options?.inputs]);
        return intents;
      };
      const handlers = new Map<string, EvalHandler>();
      shell.registerEvalHandler = (_pluginId, id, evalHandler): void => {
        handlers.set(id, evalHandler);
      };
      for (const plugin of plugins) await plugin.register(shell);

      await handler(handlers, "generate")({});

      const generated = await service.getEntity({
        entityType: "assessed",
        id: "generated",
      });
      expect(generated?.content).toContain(
        "runProjectionRule is not available in a generation",
      );
      expect(ran).toEqual([]);
    } finally {
      service.close();
      await directory.cleanup();
    }
  });
});
