import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { PluginManager } from "../src/manager/pluginManager";
import { PluginStatus } from "../src/manager/types";
import {
  defineEntity,
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type ServiceJobDefinition,
} from "../src";

// Spike: can one package own a stored entity *and* configured behaviour?
// This is the `@brains/link` shape — a link entity plus a capture job that
// needs an API key — which today forces either a config mechanism on the
// entity surface or a package split.

const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved URL.",
  metadata: z.object({ url: z.string() }),
});

const captureInput = z.object({ url: z.string() });
const captureOutput = z.object({ fetchedWith: z.string() });

// A defineJob result carries a one-shot runtime-type binding, so it belongs
// to exactly one service. Each definition under test gets its own.
const captureJob = (): ServiceJobDefinition<
  "capture-bookmark",
  typeof captureInput,
  typeof captureOutput
> =>
  defineJob({
    name: "capture-bookmark",
    input: captureInput,
    output: captureOutput,
  });

/**
 * Install a service definition, then run its capture job the way the queue
 * would, returning whatever the job created.
 */
async function runCaptureJob(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): Promise<unknown> {
  const plugins = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name: "@fixture/spike",
      version: "0.1.0",
    },
  );

  const logger = createSilentLogger("service-entity-write-spike");
  const shell = createMockShell({ logger });
  const entityService = shell.getEntityService();
  let created: unknown = null;
  entityService.createEntity = (async (request: { entity: unknown }) => {
    created = request.entity;
    return { entityId: "bookmark-1", jobId: "job-1", skipped: false };
  }) as typeof entityService.createEntity;

  const queue = shell.getJobQueueService();
  const handlers = new Map<string, { process: JobProcess }>();
  const registerHandler = queue.registerHandler.bind(queue);
  queue.registerHandler = ((
    name: string,
    handler: { process: JobProcess },
    pluginId?: string,
  ): void => {
    handlers.set(name, handler);
    registerHandler(name, handler as never, pluginId);
  }) as unknown as typeof queue.registerHandler;
  // getJobQueueService builds a fresh object per call, so the override only
  // survives if the instance is pinned.
  shell.getJobQueueService = (): typeof queue => queue;

  const manager = PluginManager.createFresh(logger, shell.getDaemonRegistry());
  manager.setShell(shell);
  for (const plugin of plugins) manager.registerPlugin(plugin);
  await manager.initializePlugins();

  const entry = [...handlers.entries()].find(([name]) =>
    name.includes("capture-bookmark"),
  );
  const failed = manager.getFailedPlugins();
  if (failed.length > 0) {
    throw new Error(
      failed.map(({ id, error }) => `${id}: ${error.message}`).join("; "),
    );
  }
  if (!entry) throw new Error("capture job handler was not registered");
  await entry[1].process({ url: "https://example.com" }, "job-1", {
    report: async (): Promise<void> => {},
  });
  return created;
}

type JobProcess = (
  data: unknown,
  jobId: string,
  progress: { report(input: unknown): Promise<void> },
) => Promise<unknown>;

describe("service package declaring entities", () => {
  it("emits an entity plugin per declared type alongside the service plugin", () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ apiKey: z.string().default("anonymous") }),
      entities: [bookmark],
      setup: ({ config }) => ({ fetcher: `fetcher(${config.apiKey})` }),
      jobs: ({ state }) => [
        captureJob().handle(async () => ({ fetchedWith: state.fetcher })),
      ],
    });

    const plugins = instantiatePluginPackageDefinition(
      definition,
      { apiKey: "secret" },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    );

    expect(plugins.map((plugin) => plugin.type)).toEqual(["service", "entity"]);
    expect(plugins.map((plugin) => plugin.id)).toEqual([
      "@fixture/bookmarks:bookmarks",
      "@fixture/bookmarks:bookmark",
    ]);
  });

  // The instantiate-time guard is only half the question. This is the half
  // the guard may actually have been protecting: both plugins reaching a
  // running shell, registering, and the entity type becoming usable.
  it("registers both plugins and the declared entity type in a live shell", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ apiKey: z.string().default("anonymous") }),
      entities: [bookmark],
      setup: ({ config }) => ({ fetcher: `fetcher(${config.apiKey})` }),
      jobs: ({ state }) => [
        captureJob().handle(async () => ({ fetchedWith: state.fetcher })),
      ],
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      { apiKey: "secret" },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    );

    const logger = createSilentLogger("service-entities-spike");
    const shell = createMockShell({ logger });
    const manager = PluginManager.createFresh(
      logger,
      shell.getDaemonRegistry(),
    );
    manager.setShell(shell);
    for (const plugin of plugins) manager.registerPlugin(plugin);
    await manager.initializePlugins();

    for (const plugin of plugins) {
      expect(manager.getPluginStatus(plugin.id)).toBe(PluginStatus.INITIALIZED);
    }
    expect(shell.getEntityService().getEntityTypes()).toContain("bookmark");
  });

  // A capture job needs both halves: config to reach the outside world, and
  // a write to store what it brought back. Writes are scoped by construction
  // — the job passes a definition object, and only definitions this package
  // declared are accepted.
  it("lets a job write an entity type the package declares", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ apiKey: z.string().default("anonymous") }),
      entities: [bookmark],
      setup: ({ config }) => ({ apiKey: config.apiKey }),
      jobs: ({ state }) => [
        captureJob().handle(async ({ input, entities }) => {
          await entities.create(bookmark, {
            entityType: "bookmark",
            content: `fetched ${input.url} with ${state.apiKey}`,
            metadata: { url: input.url },
          });
          return { fetchedWith: state.apiKey };
        }),
      ],
    });

    const created = await runCaptureJob(definition);
    expect(created).toMatchObject({ entityType: "bookmark" });
  });

  it("refuses a write to an entity type the package does not declare", async () => {
    const definition = defineServicePlugin({
      id: "trespasser",
      config: z.object({}),
      entities: [],
      setup: () => ({}),
      jobs: () => [
        captureJob().handle(async ({ entities }) => {
          await entities.create(bookmark, {
            entityType: "bookmark",
            content: "not mine",
            metadata: { url: "https://example.com" },
          });
          return { fetchedWith: "none" };
        }),
      ],
    });

    expect(runCaptureJob(definition)).rejects.toThrow(
      /may only write entity types it declares/,
    );
  });

  it("still emits only a service plugin when no entities are declared", () => {
    const definition = defineServicePlugin({
      id: "plain",
      config: z.object({}),
      setup: () => ({}),
    });

    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/plain", version: "0.1.0" },
    );

    expect(plugins.map((plugin) => plugin.type)).toEqual(["service"]);
  });
});
