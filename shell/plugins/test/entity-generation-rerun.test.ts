import { afterEach, describe, expect, it } from "bun:test";
import { EntityRegistry, EntityService } from "@brains/entity-service";
import { migrateEntities } from "@brains/entity-service/migrate";
import type { JobHandler, JobQueueEnqueueRequest } from "@brains/job-queue";
import {
  createMockProgressReporter,
  createSilentLogger,
  createTestDirectory,
  waitUntil,
} from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createMockShell } from "../src/test/mock-shell";
import { queuedByPackage } from "../src/test/package-job-data";
import {
  createTemplate,
  defineEntity,
  defineEntityPackage,
  entityRuntime,
  instantiatePluginPackageDefinition,
} from "../src";
import { afterGeneration } from "../src/entity/entity-runtime";
import { isDeclaredEntityType } from "../src/test/declared-entity-type";

/**
 * A generation job that dies after its entity commits and before the queue
 * marks it done is reclaimed and run again under the same job id. The rerun
 * finds its own committed entity and finishes from it: one entity, one
 * follow-up, and nothing generated or queued a second time.
 */

let close: (() => Promise<void>) | undefined;
afterEach(async () => {
  await close?.();
  close = undefined;
});

const generationTemplate = createTemplate({
  name: "generation",
  description: "Writes a dispatch",
  schema: z.object({ title: z.string() }),
  requiredPermission: "public",
  dataSourceId: "shell:ai-content",
  basePrompt: "Write a dispatch.",
});

interface Counters {
  generated: number;
  followedUp: string[];
  /** How the first follow-up ends: the process dies inside it, or it throws. */
  followUp: "die" | "throw" | "run";
  /** Whether an attempt died inside its follow-up. */
  died: boolean;
}

function counters(followUp: Counters["followUp"]): Counters {
  return { generated: 0, followedUp: [], followUp, died: false };
}

function dispatch(counters: Counters): Parameters<typeof defineEntity>[0] {
  return {
    type: "dispatch",
    purpose: "A dispatch queued for publishing.",
    metadata: z.object({ title: z.string(), status: z.string() }),
    templates: { generation: generationTemplate },
    generation: afterGeneration(
      {
        input: z.object({}),
        generate: async (context) => {
          counters.generated += 1;
          return entityRuntime(context).deduplicated({
            success: true,
            id: "taken",
            content: `Generated ${counters.generated}`,
            metadata: { title: "Taken", status: "queued" },
            resultExtras: { title: "Taken" },
          });
        },
      },
      async ({ outcome }) => {
        if (!("written" in outcome)) return;
        if (counters.followUp === "die") {
          counters.died = true;
          await new Promise<never>(() => {});
        }
        if (counters.followUp === "throw") {
          throw new Error("The follow-up's queue refused it");
        }
        counters.followedUp.push(outcome.written.entityId);
      },
    ),
  };
}

async function install(counters: Counters): Promise<{
  handler: JobHandler;
  service: EntityService;
  enqueued: JobQueueEnqueueRequest[];
}> {
  const directory = await createTestDirectory();
  const logger = createSilentLogger();
  const registry = EntityRegistry.createFresh(logger);
  const plugins = instantiatePluginPackageDefinition(
    defineEntityPackage({
      id: "dispatches",
      entities: [defineEntity(dispatch(counters))],
    }),
    {},
    { name: "@fixture/dispatches", version: "0.1.0" },
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
  close = async (): Promise<void> => {
    service.close();
    await directory.cleanup();
  };
  const shell = createMockShell({ logger, entityService: service });
  for (const plugin of plugins) await plugin.register(shell);
  // The id the generation asks for is taken, so it deduplicates.
  await service.createEntity({
    entity: {
      id: "taken",
      entityType: "dispatch",
      content: "Already here",
      metadata: { title: "Taken", status: "draft" },
    },
  });
  const queue = shell.getJobQueueService();
  const enqueued: JobQueueEnqueueRequest[] = [];
  const enqueue = queue.enqueue.bind(queue);
  queue.enqueue = async (request): Promise<string> => {
    enqueued.push(request);
    return enqueue(request);
  };
  const handler = queue.getHandler("dispatch:generation");
  if (!handler) throw new Error("No dispatch generation");
  return { handler, service, enqueued };
}

function run(
  handler: JobHandler,
  jobId: string,
  entityId?: string,
): Promise<unknown> {
  return handler.process(
    handler.validateAndParse(
      queuedByPackage(
        "@fixture/dispatches:dispatch",
        { coverImage: true },
        { entityId },
      ),
    ),
    jobId,
    createMockProgressReporter(),
    new AbortController().signal,
  );
}

async function generatedDispatches(service: EntityService): Promise<string[]> {
  const stored = await service.listEntities({
    entityType: "dispatch",
    options: { filter: { visibilityScope: "restricted" } },
  });
  return stored
    .map((entity) => entity.id)
    .filter((id) => id !== "taken")
    .sort();
}

function coverImages(enqueued: JobQueueEnqueueRequest[]): unknown[] {
  return enqueued
    .filter((request) => request.type === "image:image-generate")
    .map((request) => ({
      target: Reflect.get(Object(request.data), "targetEntityId"),
      deduplication: request.options?.deduplication,
      deduplicationKey: request.options?.deduplicationKey,
    }));
}

async function queuedDispatches(service: EntityService): Promise<string[]> {
  const queued = await service.listEntities({
    entityType: "dispatch",
    options: {
      filter: { visibilityScope: "restricted", metadata: { status: "queued" } },
    },
  });
  return queued.map((entity) => entity.id).sort();
}

/** The first attempt commits, then dies inside its first follow-up. */
async function killedAfterCommit(
  handler: JobHandler,
  counters: Counters,
  jobId: string,
): Promise<void> {
  void run(handler, jobId);
  await waitUntil(() => counters.died, "the first attempt to die");
  counters.followUp = "run";
}

const deduplicatedCover = (jobId: string): unknown => ({
  target: "taken-2",
  deduplication: "skip",
  deduplicationKey: `${jobId}:cover-image`,
});

describe("a deduplicated generation run again under its job id", () => {
  it("finishes a run killed after its commit from the committed entity", async () => {
    const state = counters("die");
    const { handler, service, enqueued } = await install(state);

    await killedAfterCommit(handler, state, "job-killed");
    expect(await generatedDispatches(service)).toEqual(["taken-2"]);
    const result = await run(handler, "job-killed");

    expect(result).toMatchObject({ success: true, entityId: "taken-2" });
    expect(await generatedDispatches(service)).toEqual(["taken-2"]);
    expect(await queuedDispatches(service)).toEqual(["taken-2"]);
    expect(state.generated).toBe(1);
    expect(state.followedUp).toEqual(["taken-2"]);
    expect(coverImages(enqueued)).toEqual([deduplicatedCover("job-killed")]);
  });

  it("finishes a run whose follow-up failed, when the queue retries it", async () => {
    const state = counters("throw");
    const { handler, service, enqueued } = await install(state);

    const failed = await run(handler, "job-retried");
    expect(failed).toMatchObject({ success: false });
    state.followUp = "run";
    const result = await run(handler, "job-retried");

    expect(result).toMatchObject({ success: true, entityId: "taken-2" });
    expect(await generatedDispatches(service)).toEqual(["taken-2"]);
    expect(await queuedDispatches(service)).toEqual(["taken-2"]);
    expect(state.generated).toBe(1);
    expect(state.followedUp).toEqual(["taken-2"]);
    expect(coverImages(enqueued)).toEqual([deduplicatedCover("job-retried")]);
  });

  it("repeats nothing when a finished run is run again", async () => {
    const state = counters("run");
    const { handler, service, enqueued } = await install(state);

    const first = await run(handler, "job-finished");
    const second = await run(handler, "job-finished");

    expect(first).toMatchObject({ success: true, entityId: "taken-2" });
    expect(second).toEqual(first);
    expect(await generatedDispatches(service)).toEqual(["taken-2"]);
    expect(await queuedDispatches(service)).toEqual(["taken-2"]);
    expect(state.generated).toBe(1);
    expect(state.followedUp).toEqual(["taken-2"]);
    expect(coverImages(enqueued)).toEqual([deduplicatedCover("job-finished")]);
  });

  it("still writes a second entity for a second job", async () => {
    const state = counters("run");
    const { handler, service } = await install(state);

    await run(handler, "job-one");
    await run(handler, "job-two");

    expect(await generatedDispatches(service)).toEqual(["taken-2", "taken-3"]);
    expect(state.followedUp).toEqual(["taken-2", "taken-3"]);
  });

  it("finishes without follow-ups when the committed entity was deleted", async () => {
    const state = counters("die");
    const { handler, service, enqueued } = await install(state);

    await killedAfterCommit(handler, state, "job-deleted");
    await service.deleteEntity({ entityType: "dispatch", id: "taken-2" });
    const result = await run(handler, "job-deleted");

    expect(result).toMatchObject({ success: true, entityId: "taken-2" });
    expect(await generatedDispatches(service)).toEqual([]);
    expect(state.generated).toBe(1);
    expect(state.followedUp).toEqual([]);
    expect(coverImages(enqueued)).toEqual([]);
  });

  it("runs a filled stub's follow-ups once across reruns", async () => {
    const state = counters("run");
    const { handler, service, enqueued } = await install(state);
    await service.createEntity({
      entity: {
        id: "allocated",
        entityType: "dispatch",
        content: "",
        metadata: { title: "Allocated", status: "generating" },
      },
    });

    await run(handler, "job-stub", "allocated");
    const second = await run(handler, "job-stub", "allocated");

    expect(second).toMatchObject({ success: true, entityId: "allocated" });
    expect(await generatedDispatches(service)).toEqual(["allocated"]);
    expect(state.followedUp).toEqual(["allocated"]);
    expect(coverImages(enqueued)).toEqual([
      {
        target: "allocated",
        deduplication: "skip",
        deduplicationKey: "job-stub:cover-image",
      },
    ]);
  });
});
