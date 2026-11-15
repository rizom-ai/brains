import { describe, expect, it } from "bun:test";
import { createSilentLogger, createTestDirectory } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type EvalHandler,
} from "../src";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A first-party eval that runs its type's own generation, as an entity
 * plugin class's eval ran its generation handler: in process, as the
 * package, writing the record to the store and reporting its progress.
 */

const memoInput = z.object({ prompt: z.string() });
const progressStep = z.object({
  progress: z.number(),
  message: z.string().optional(),
});

const memo = defineEntity({
  type: "memo",
  purpose: "A memo its eval generates.",
  metadata: z.object({ title: z.string() }),
  generation: {
    input: memoInput,
    generate: async (context) => {
      const { input, progress } = context;
      if (input.prompt === "nested") {
        // A generation is no eval: it cannot start one of its own.
        const refused = await entityRuntime(context)
          .runGeneration({ prompt: "inner" })
          .then(
            () => "ran",
            (error: unknown) =>
              error instanceof Error ? error.message : "refused",
          );
        return {
          success: true,
          id: "nested",
          content: refused,
          metadata: { title: "Nested" },
        };
      }
      if (input.prompt === "refuse") {
        return { success: false, error: "Refused" };
      }
      await progress.report({ progress: 50, message: "Writing the memo" });
      return {
        success: true,
        id: "memo-1",
        content: input.prompt,
        metadata: { title: "Memo One" },
        resultExtras: { slug: "memo-one" },
      };
    },
  },
  evals: {
    create: async (input, context) => {
      const steps: Array<z.output<typeof progressStep>> = [];
      const result = await entityRuntime(context).runGeneration(input, {
        onProgress: (step) => {
          steps.push(step);
        },
      });
      return { result, steps };
    },
  },
});

interface Installed {
  readonly shell: MockShell;
  readonly service: IEntityService;
  readonly create: EvalHandler;
  close(): Promise<void>;
}

async function installed(): Promise<Installed> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger("eval-run-generation");
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [memo] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
    { pluginId: "memos" },
  );
  for (const plugin of plugins) {
    if (isDeclaredEntityType(plugin)) {
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
    embeddingService: {
      identity: { model: "test:mock", dimensions: 1536, promptRevision: 0 },
      embedQuery: async () => {
        throw new Error("Unexpected embedding");
      },
      embedDocuments: async () => {
        throw new Error("Unexpected embedding");
      },
    },
  });
  await service.initialize();
  const shell = createMockShell({ logger, entityService: service });
  const handlers = new Map<string, EvalHandler>();
  shell.registerEvalHandler = (_pluginId, id, handler): void => {
    handlers.set(id, handler);
  };
  for (const plugin of plugins) await plugin.register(shell);
  const create = handlers.get("create");
  if (!create) throw new Error("No create eval");
  return {
    shell,
    service,
    create,
    close: async (): Promise<void> => {
      service.close();
      await directory.cleanup();
    },
  };
}

describe("a first-party eval running its type's generation", () => {
  it("writes the record to the store and reports the run's progress", async () => {
    const harness = await installed();
    try {
      const answer = z
        .object({
          result: z.looseObject({
            success: z.boolean(),
            entityId: z.string().optional(),
            slug: z.string().optional(),
          }),
          steps: z.array(progressStep),
        })
        .parse(await harness.create({ prompt: "Remember the milk" }));
      expect(answer.result).toMatchObject({
        success: true,
        entityId: "memo-1",
        slug: "memo-one",
      });
      expect(answer.steps).toContainEqual({
        progress: 50,
        message: "Writing the memo",
      });
      const stored = await harness.service.getEntity({
        entityType: "memo",
        id: "memo-1",
      });
      expect(stored?.content).toContain("Remember the milk");
    } finally {
      await harness.close();
    }
  });

  it("answers a refused generation with its reason and writes nothing", async () => {
    const harness = await installed();
    try {
      expect(await harness.create({ prompt: "refuse" })).toMatchObject({
        result: { success: false, error: "Refused" },
      });
      expect(
        await harness.service.listEntities({ entityType: "memo" }),
      ).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it("is refused outside an eval", async () => {
    const harness = await installed();
    try {
      await harness.create({ prompt: "nested" });
      const nested = await harness.service.getEntity({
        entityType: "memo",
        id: "nested",
      });
      expect(nested?.content).toContain(
        "runGeneration is not available in a generation",
      );
    } finally {
      await harness.close();
    }
  });
});
