import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestDirectory,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  EntityPlugin,
  createTemplate,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type AnyEntityDefinition,
} from "../src";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

/**
 * A first-party generation that asks for it lands beside a record that
 * already has its id, as the entity plugin classes' generations created
 * with `deduplicateId`, on the brain's own entity store, which refuses a
 * taken id otherwise.
 */

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const generationTemplate = createTemplate({
  name: "generation",
  description: "Writes a memo",
  schema: z.object({ title: z.string() }),
  requiredPermission: "public",
  dataSourceId: "shell:ai-content",
  basePrompt: "Write a memo.",
});

function memo(deduplicate: boolean): AnyEntityDefinition {
  return defineEntity({
    type: "memo",
    purpose: "A memo.",
    metadata: z.object({ title: z.string() }),
    templates: { generation: generationTemplate },
    generation: {
      input: z.object({}),
      generate: async (context) => {
        const result = {
          success: true,
          id: "taken",
          content: "Generated",
          metadata: { title: "Taken" },
        } as const;
        return deduplicate
          ? entityRuntime(context).deduplicated(result)
          : result;
      },
    },
  });
}

async function generate(deduplicate: boolean): Promise<{
  result: unknown;
  service: EntityService;
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [memo(deduplicate)] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
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
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const shell = createMockShell({ logger, entityService: service });
  for (const plugin of plugins) await plugin.register(shell);
  await service.createEntity({
    entity: {
      id: "taken",
      entityType: "memo",
      content: "Already here",
      metadata: { title: "Taken" },
    },
  });
  const handler = shell.getJobQueueService().getHandler("memo:generation");
  if (!handler) throw new Error("No memo generation");
  const parsed = handler.validateAndParse(
    queuedByPackage("@fixture/memos:memo", {}),
  );
  const result = await handler.process(
    parsed,
    "job-under-test",
    createMockProgressReporter(),
    new AbortController().signal,
  );
  return { result, service };
}

describe("a generation that deduplicates its id", () => {
  it("lands beside a record that already has the id", async () => {
    const { result, service } = await generate(true);
    expect(result).toMatchObject({ success: true, entityId: "taken-2" });
    const kept = await service.getEntity({
      entityType: "memo",
      id: "taken",
      visibilityScope: "restricted",
    });
    expect(kept?.content).toBe("Already here");
    const written = await service.getEntity({
      entityType: "memo",
      id: "taken-2",
      visibilityScope: "restricted",
    });
    expect(written?.content).toBe("Generated");
  });

  it("fails without it, leaving the record that has the id", async () => {
    const { result, service } = await generate(false);
    expect(result).toMatchObject({ success: false });
    const kept = await service.getEntity({
      entityType: "memo",
      id: "taken",
      visibilityScope: "restricted",
    });
    expect(kept?.content).toBe("Already here");
  });
});
