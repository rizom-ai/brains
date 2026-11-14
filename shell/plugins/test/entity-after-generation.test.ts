import { describe, expect, it } from "bun:test";
import { defineJobContract } from "@brains/contracts";
import {
  createMockProgressReporter,
  createSilentLogger,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  EntityRegistry,
  EntityService,
  type IEntityService,
} from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import { createTestDirectory } from "@brains/test-utils";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  EntityPlugin,
  afterGeneration,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
  type GenerationOutcomeContext,
} from "../src";
import { createRefusingEmbeddingService } from "@brains/entity-service/test";

/**
 * A first-party generation's step after it runs, as an entity plugin
 * class's generation handler queued its follow-up work once the record was
 * written and reported its failure otherwise: told the id written (the next
 * free one when its own was taken) and its title, or the failure, with the parsed input,
 * the package's jobs and its retry scope.
 */

const memoMetadata = z.object({ title: z.string() });
const memoInput = z.object({
  prompt: z.string(),
  fail: z.enum(["refuse", "throw"]).optional(),
  followUp: z.boolean().optional(),
});
const followUpContract = defineJobContract({
  type: "memos:follow-up",
  input: z.object({ memoId: z.string() }),
});

const outcomes: Array<
  Pick<GenerationOutcomeContext<unknown>, "outcome"> & { input: unknown }
> = [];

const memo = defineEntity({
  type: "memo",
  purpose: "A memo with work after its generation.",
  metadata: memoMetadata,
  generation: afterGeneration(
    {
      input: memoInput,
      generate: async (context) => {
        if (context.input.fail === "refuse") {
          return { success: false, error: "Refused" };
        }
        if (context.input.fail === "throw") throw new Error("Model down");
        return entityRuntime(context).deduplicated({
          success: true,
          id: "taken",
          content: context.input.prompt,
          metadata: { title: "A Taken Memo" },
        });
      },
    },
    async ({ input, outcome, jobs, retries }) => {
      outcomes.push({ input, outcome });
      if ("written" in outcome && input?.followUp) {
        await retries.run(
          () =>
            jobs.enqueue(followUpContract, {
              memoId: outcome.written.entityId,
            }),
          "queue the memo's follow-up",
          `follow-up:${outcome.written.entityId}`,
        );
      }
    },
  ),
});

interface Installed {
  readonly shell: MockShell;
  close(): Promise<void>;
}

/** On the brain's entity store, which deduplicates a taken id. */
async function installed(): Promise<Installed> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger("after-generation");
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({ id: "memos", entities: [memo] }),
    {},
    { name: "@fixture/memos", version: "0.1.0" },
    { pluginId: "memos" },
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
  const entityService: IEntityService = service;
  const shell = createMockShell({ logger, entityService });
  for (const plugin of plugins) await plugin.register(shell);
  // The generation's own id is taken, so it lands under the next free one.
  await service.createEntity({
    entity: {
      id: "taken",
      entityType: "memo",
      content: "First",
      metadata: { title: "Taken" },
    },
  });
  return {
    shell,
    close: async (): Promise<void> => {
      service.close();
      await directory.cleanup();
    },
  };
}

async function generate(
  harness: Installed,
  input: z.input<typeof memoInput>,
): Promise<unknown> {
  const handler = harness.shell
    .getJobQueueService()
    .getHandler("memo:generation");
  if (!handler) throw new Error("No memo generation");
  return handler.process(
    handler.validateAndParse(queuedByPackage("memos", input)),
    "job-1",
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

describe("a first-party generation's step after it runs", () => {
  it("is told the id and title written and its input, and queues follow-up work", async () => {
    outcomes.length = 0;
    const harness = await installed();
    try {
      expect(
        await generate(harness, { prompt: "Body", followUp: true }),
      ).toMatchObject({ success: true });
      expect(outcomes).toEqual([
        {
          input: { prompt: "Body", followUp: true },
          outcome: {
            written: { entityId: "taken-2", title: "A Taken Memo" },
          },
        },
      ]);
      const queued = await harness.shell
        .getJobQueueService()
        .getRecentJobs(undefined, 10);
      expect(
        queued
          .filter((job) => job.type === "memos:follow-up")
          .map((job) => JSON.parse(job.data)),
      ).toEqual([{ memoId: "taken-2" }]);
    } finally {
      await harness.close();
    }
  });

  it("is told a refusal and a thrown failure", async () => {
    outcomes.length = 0;
    const harness = await installed();
    try {
      await generate(harness, { prompt: "Body", fail: "refuse" });
      await generate(harness, { prompt: "Body", fail: "throw" });
      expect(outcomes).toEqual([
        {
          input: { prompt: "Body", fail: "refuse" },
          outcome: { failed: "Refused" },
        },
        {
          input: { prompt: "Body", fail: "throw" },
          outcome: { failed: "Model down" },
        },
      ]);
    } finally {
      await harness.close();
    }
  });

  it("leaves the generation otherwise as it was", () => {
    expect(memo.generation?.input).toBe(memoInput);
  });
});
