import { describe, expect, it } from "bun:test";
import { parseInstanceOverrides, resolve } from "@brains/app";
import {
  PluginManager,
  type BaseEntity,
  type JobHandler,
  type JobOptions,
  type Plugin,
} from "@brains/plugins";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import rover from "../src";

interface QueueRequest {
  type: string;
  data: unknown;
  options?: JobOptions | undefined;
}

interface PendingJob extends QueueRequest {
  id: string;
}

function createDrainableQueue(): {
  service: object;
  drain: (maxJobs: number) => Promise<string[]>;
  pendingCount: () => number;
} {
  const handlers = new Map<string, JobHandler>();
  const pending: PendingJob[] = [];
  let active: PendingJob | undefined;
  let nextJobId = 0;

  const hasMatchingKey = (job: PendingJob, request: QueueRequest): boolean =>
    job.type === request.type &&
    (!request.options?.deduplicationKey ||
      job.options?.deduplicationKey === request.options.deduplicationKey);

  const service = {
    registerHandler: (
      type: string,
      handler: JobHandler,
      _pluginId?: string,
    ): void => {
      handlers.set(type, handler);
    },
    unregisterHandler: (type: string): void => {
      handlers.delete(type);
    },
    unregisterPluginHandlers: (): void => {},
    getRegisteredTypes: (): string[] => Array.from(handlers.keys()),
    getHandler: (type: string): JobHandler | undefined => handlers.get(type),
    enqueue: async (request: QueueRequest): Promise<string> => {
      const strategy = request.options?.deduplication;
      const pendingDuplicate = pending.find((job) =>
        hasMatchingKey(job, request),
      );
      if (strategy === "skip" && pendingDuplicate) {
        return pendingDuplicate.id;
      }
      if (strategy === "coalesce") {
        const duplicate =
          pendingDuplicate ??
          (active && hasMatchingKey(active, request) ? active : undefined);
        if (duplicate) return duplicate.id;
      }

      const job = { ...request, id: `job-${++nextJobId}` };
      pending.push(job);
      return job.id;
    },
    getActiveJobs: async (): Promise<[]> => [],
    getFailedJobs: async (): Promise<[]> => [],
    getStatus: async (): Promise<null> => null,
    getStatusByEntityId: async (): Promise<null> => null,
    update: async (): Promise<void> => {},
    complete: async (): Promise<void> => {},
    fail: async (): Promise<void> => {},
  };

  return {
    service,
    drain: async (maxJobs): Promise<string[]> => {
      const processed: string[] = [];
      while (pending.length > 0) {
        if (processed.length >= maxJobs) {
          throw new Error(
            `Projection queue did not quiesce within ${maxJobs} jobs`,
          );
        }

        const job = pending.shift();
        if (!job) break;
        active = job;
        const handler = handlers.get(job.type);
        if (!handler) throw new Error(`Missing handler for ${job.type}`);
        const parsed = handler.validateAndParse(job.data);
        if (parsed === null)
          throw new Error(`Invalid job data for ${job.type}`);
        await handler.process(
          parsed,
          job.id,
          {
            report: async (): Promise<void> => {},
          } as never,
          new AbortController().signal,
        );
        processed.push(job.type);
        active = undefined;
      }
      return processed;
    },
    pendingCount: (): number => pending.length,
  };
}

function installEntityEventForwarding(
  shell: ReturnType<typeof createMockShell>,
): void {
  const entityService = shell.getEntityService();
  const createEntity = entityService.createEntity.bind(entityService);
  const updateEntity = entityService.updateEntity.bind(entityService);

  entityService.createEntity = (async (
    request: Parameters<typeof entityService.createEntity>[0],
  ) => {
    const result = await createEntity(request as never);
    if (!result.skipped) {
      const entity = await entityService.getEntity({
        entityType: request.entity.entityType,
        id: result.entityId,
      });
      await shell.getMessageBus().send({
        type: "entity:created",
        payload: {
          entityType: request.entity.entityType,
          entityId: result.entityId,
          entity,
        },
        sender: "entity-service",
        broadcast: true,
      });
    }
    return result;
  }) as typeof entityService.createEntity;

  entityService.updateEntity = (async (
    request: Parameters<typeof entityService.updateEntity>[0],
  ) => {
    const previous = await entityService.getEntity<BaseEntity>({
      entityType: request.entity.entityType,
      id: request.entity.id,
    });
    const result = await updateEntity(request as never);
    if (!result.skipped) {
      const entity = await entityService.getEntity({
        entityType: request.entity.entityType,
        id: result.entityId,
      });
      await shell.getMessageBus().send({
        type: "entity:updated",
        payload: {
          entityType: request.entity.entityType,
          entityId: result.entityId,
          entity,
          previousMetadata: previous?.metadata,
        },
        sender: "entity-service",
        broadcast: true,
      });
    }
    return result;
  }) as typeof entityService.updateEntity;
}

function getProjectionPlugins(plugins: Plugin[]): Plugin[] {
  const ids = new Set(["prompt", "topics", "skill", "swot"]);
  const selected = plugins.filter((plugin) => ids.has(plugin.id));
  expect(selected.map((plugin) => plugin.id)).toEqual([
    "prompt",
    "topics",
    "skill",
    "swot",
  ]);
  return selected;
}

describe("full preset projection resilience", () => {
  it("validates the complete entity and semantic-event projection graph", async () => {
    const config = resolve(
      rover,
      {},
      parseInstanceOverrides("brain: rover\npreset: full\n"),
    );
    const shell = createMockShell();
    const pluginManager = PluginManager.createFresh(
      createSilentLogger(),
      shell.getDaemonRegistry(),
    );
    pluginManager.setShell(shell);
    for (const plugin of config.plugins ?? []) {
      pluginManager.registerPlugin(plugin);
    }

    await pluginManager.initializePlugins();
    shell.getProfileKindRegistry().finalize();
    shell.getChannelRegistry().finalize();
    await pluginManager.finalizePluginRegistrations();

    const graph = pluginManager.getProjectionGraphSnapshot();
    const projectionIds = graph.projections.map(({ id }) => id);
    expect(projectionIds).toContain("topics-projection");
    expect(projectionIds).toContain("skill-derivation");
    expect(projectionIds).toContain("swot-derivation");
    expect(projectionIds).toContain("social-post-generation");
    expect(projectionIds).toContain("newsletter-generation");
    expect(projectionIds).toContain("series-projection");

    const edgeCauses = new Map(
      graph.edges.map((edge) => [`${edge.from} -> ${edge.to}`, edge.causes]),
    );
    expect(edgeCauses.get("topics-projection -> skill-derivation")).toEqual([
      "event:topics:batch-completed",
    ]);
    expect(edgeCauses.get("skill-derivation -> swot-derivation")).toEqual([
      "entity:skill",
    ]);
    expect(
      edgeCauses.get("social-post-generation -> topics-projection"),
    ).toEqual(["entity:social-post"]);
    expect(
      edgeCauses.get("newsletter-generation -> topics-projection"),
    ).toEqual(["entity:newsletter"]);
    expect(graph.declaredCycles).toEqual([]);
    expect(graph.unknownSourceTypes).toEqual([]);

    await pluginManager.shutdownPlugins();
  });

  it("runs one document-to-SWOT wave without feeding SWOT back into topics", async () => {
    const config = resolve(
      rover,
      {},
      parseInstanceOverrides("brain: rover\npreset: full\n"),
    );
    const shell = createMockShell();
    const queue = createDrainableQueue();
    shell.getJobQueueService = (): never => queue.service as never;
    installEntityEventForwarding(shell);
    shell.getProfileKindRegistry().finalize();

    shell.generateContent = async <T>(input): Promise<T> => {
      if (input.templateName === "topics:extraction") {
        return {
          topics: [
            {
              title: "Runtime Resilience",
              content: "Bounded recovery for background work.",
              relevanceScore: 1,
            },
          ],
        } as T;
      }
      if (input.templateName === "skill:skill-derivation") {
        return {
          skills: [
            {
              name: "Design resilient runtimes",
              description: "Design bounded and recoverable background systems.",
              tags: ["resilience", "runtime", "queues"],
              examples: ["Review a worker failure mode"],
            },
          ],
        } as T;
      }
      throw new Error(`Unexpected template: ${input.templateName}`);
    };

    let swotGenerationCall = 0;
    shell.generateObject = async <T>(): Promise<{ object: T }> => {
      swotGenerationCall++;
      return {
        object: (swotGenerationCall === 1
          ? {
              strengths: [
                {
                  theme: "runtime resilience",
                  evidence: "The owner has a resilient runtime design skill.",
                  action: "Use it when reviewing background workers.",
                },
              ],
              weaknesses: [],
              opportunities: [],
              threats: [],
            }
          : {
              strengths: [
                {
                  sourceTheme: "runtime resilience",
                  title: "Runtime resilience",
                  detail: "Use it when reviewing background workers.",
                },
              ],
              weaknesses: [],
              opportunities: [],
              threats: [],
            }) as T,
      };
    };

    for (const plugin of getProjectionPlugins(config.plugins ?? [])) {
      await plugin.register(shell);
      shell.addPlugin(plugin);
    }

    await shell.getMessageBus().send({
      type: "sync:initial:completed",
      payload: { success: true },
      sender: "directory-sync",
      broadcast: true,
    });
    expect(await queue.drain(4)).toEqual([
      "topic:project",
      "skill:project",
      "swot:derive",
    ]);

    await shell.getEntityService().createEntity({
      entity: {
        id: "runtime-resilience-plan",
        entityType: "document",
        content: "A runtime resilience plan for projections and job workers.",
        metadata: { title: "Runtime resilience plan" },
        visibility: "public",
      },
    } as never);

    expect(await queue.drain(4)).toEqual([
      "topic:project",
      "skill:project",
      "swot:derive",
    ]);
    expect(queue.pendingCount()).toBe(0);
    expect(
      await shell.getEntityService().listEntities({ entityType: "topic" }),
    ).toHaveLength(1);
    expect(
      await shell.getEntityService().listEntities({ entityType: "skill" }),
    ).toHaveLength(1);
    expect(
      await shell.getEntityService().listEntities({ entityType: "swot" }),
    ).toHaveLength(1);
  });
});
