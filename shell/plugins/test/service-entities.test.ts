import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import type { JobHandler } from "@brains/job-queue";
import type {
  BaseEntity,
  CreateExecutionContext,
  CreateInterceptor,
  EntityMutationResult,
} from "@brains/entity-service";
import {
  createMockProgressReporter,
  createMockEntityService,
  createMockShell,
  createSilentLogger,
  stubMethod,
} from "@brains/test-utils";
import { createPluginHarness } from "../src/test/harness";
import { createTemplate } from "@brains/templates";
import { PluginManager } from "../src/manager/pluginManager";
import { PluginStatus } from "../src/manager/types";
import {
  defineEntity,
  defineJob,
  defineProjectionRule,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  SYSTEM_CHANNELS,
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
  // Reads and writes are both generic, so hand-stubbing them means
  // asserting the stub matches instead of checking it. The mock's own
  // options carry that one erasure in a single named place.
  const stored = new Map<string, BaseEntity>();
  const record = async ({
    entity,
  }: {
    entity: BaseEntity;
  }): Promise<EntityMutationResult> => {
    written = entity;
    stored.set(entity.id, entity);
    return { entityId: entity.id, jobId: "job-1", skipped: false };
  };
  const entityService = createMockEntityService({
    getEntityImpl: async ({ id }) => stored.get(id) ?? null,
    createEntityImpl: record,
    updateEntityImpl: record,
  });
  let written: unknown = null;

  shell.getEntityService = (): typeof entityService => entityService;

  const queue = shell.getJobQueueService();
  const handlers = new Map<string, JobHandler>();
  const registerHandler = queue.registerHandler.bind(queue);
  queue.registerHandler = (
    name: string,
    handler: JobHandler,
    pluginId?: string,
  ): void => {
    handlers.set(name, handler);
    registerHandler(name, handler, pluginId);
  };
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
  await entry[1].process(
    { url: "https://example.com" },
    "job-1",
    createMockProgressReporter(),
    new AbortController().signal,
  );
  return written;
}

// Forwarded to jobs.enqueue as toolContext, so an empty object is not a
// stand-in — it is a value that violates its own type.
const executionContext: CreateExecutionContext = {
  interfaceType: "cli",
  actor: { kind: "user", userId: "tester" },
};

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
          await entities.create({
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
          await entities.create({
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

  // Eval test cases exercise the same integration the jobs do, so they need
  // the same credentials. The entity-side evals slot deliberately has none.
  it("registers eval handlers that can read config", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ apiKey: z.string().default("anonymous") }),
      entities: [bookmark],
      setup: ({ config }) => ({ apiKey: config.apiKey }),
      evals: ({ state }) => ({
        fetchWithKey: async (): Promise<{ usedKey: string }> => ({
          usedKey: state.apiKey,
        }),
      }),
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      { apiKey: "secret" },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    );

    const logger = createSilentLogger("service-evals");
    const shell = createMockShell({ logger });
    const registered = new Map<string, (input: unknown) => Promise<unknown>>();
    stubMethod(
      shell,
      "registerEvalHandler",
      (_pluginId, handlerId, handler) => {
        registered.set(handlerId, handler);
      },
    );

    const manager = PluginManager.createFresh(
      logger,
      shell.getDaemonRegistry(),
    );
    manager.setShell(shell);
    for (const plugin of plugins) manager.registerPlugin(plugin);
    await manager.initializePlugins();

    const handler = registered.get("fetchWithKey");
    expect(handler).toBeDefined();
    expect(await handler?.({})).toEqual({ usedKey: "secret" });
  });

  // An eval that measures a configured pipeline needs both halves: the
  // config that shaped the pipeline, and the capabilities to seed and read
  // what it produced. Splitting those across the two evals slots forced
  // packages to reach for the raw context to get the other half.
  it("gives service eval handlers the same capability context entity evals get", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ minScore: z.number().default(0.5) }),
      entities: [bookmark],
      evals: ({ config }) => ({
        countSeeded: async (
          _input,
          { entities, fixtures },
        ): Promise<{ before: number; after: number; minScore: number }> => {
          const before = (
            await entities.listEntities({ entityType: "bookmark" })
          ).length;
          await fixtures.reset();
          return {
            before,
            after: (await entities.listEntities({ entityType: "bookmark" }))
              .length,
            minScore: config.minScore,
          };
        },
      }),
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      { minScore: 0.8 },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    );

    const logger = createSilentLogger("service-eval-context");
    const shell = createMockShell({ logger });
    const registered = new Map<string, (input: unknown) => Promise<unknown>>();
    stubMethod(
      shell,
      "registerEvalHandler",
      (_pluginId, handlerId, handler) => {
        registered.set(handlerId, handler);
      },
    );

    const manager = PluginManager.createFresh(
      logger,
      shell.getDaemonRegistry(),
    );
    manager.setShell(shell);
    for (const plugin of plugins) manager.registerPlugin(plugin);
    await manager.initializePlugins();

    await shell.getEntityService().createEntity({
      entity: {
        id: "seeded",
        entityType: "bookmark",
        content: "A seeded bookmark",
        metadata: { url: "https://example.com" },
      },
    });

    const handler = registered.get("countSeeded");
    expect(handler).toBeDefined();
    expect(await handler?.({})).toEqual({
      before: 1,
      after: 0,
      minScore: 0.8,
    });
  });

  // A capture job accepts something now and enriches it later, so it needs a
  // durable placeholder the next turn can find. The runtime owns that
  // protocol — including the restricted-scope read that finds a placeholder
  // the caller cannot otherwise see — so a package never names a visibility
  // scope.
  it("creates a pending placeholder and completes it, without naming a scope", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({}),
      entities: [bookmark],
      setup: () => ({}),
      jobs: () => [
        captureJob().handle(async ({ input, entities }) => {
          const pending = await entities.createPending({
            id: "bookmark-1",
            entityType: "bookmark",
            content: "pending",
            metadata: { url: input.url },
          });
          await entities.saveProcessed({
            id: pending.entityId,
            entityType: "bookmark",
            content: "captured",
            metadata: { url: input.url },
          });
          return { fetchedWith: "none" };
        }),
      ],
    });

    const saved = await runCaptureJob(definition);
    expect(saved).toMatchObject({ content: "captured" });
  });

  it("refuses a pending write to an entity type the package does not declare", async () => {
    const definition = defineServicePlugin({
      id: "trespasser",
      config: z.object({}),
      entities: [],
      setup: () => ({}),
      jobs: () => [
        captureJob().handle(async ({ entities }) => {
          await entities.createPending({
            id: "bookmark-1",
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

  // The entity declares the route and the service declares the job, so the
  // delegate has to resolve against the package rather than the entity
  // plugin that declared it — otherwise a bare local name never finds the
  // handler.
  it("routes a create delegate to a job the service declares", async () => {
    const captured = defineEntity({
      type: "bookmark",
      purpose: "A saved URL.",
      metadata: z.object({ url: z.string() }),
      create: { fromPrompt: { delegate: "capture-bookmark" } },
    });
    const definition = defineServicePlugin({
      id: "capture",
      config: z.object({}),
      entities: [captured],
      setup: () => ({}),
      jobs: () => [captureJob().handle(async () => ({ fetchedWith: "none" }))],
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/bookmarks", version: "0.1.0" },
    );
    const entityPlugin = plugins.find((plugin) => plugin.type === "entity");
    if (!entityPlugin) throw new Error("Entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("service-create-routing"),
    });
    let interceptor: CreateInterceptor | undefined;
    const registry = harness.getEntityRegistry();
    stubMethod(registry, "registerCreateInterceptor", (_type, registered) => {
      interceptor = registered;
    });

    const enqueued: string[] = [];
    const shell = harness.getMockShell();
    const jobQueue = shell.getJobQueueService();
    stubMethod(jobQueue, "enqueue", async ({ type }) => {
      enqueued.push(type);
      return "job-1";
    });
    shell.getJobQueueService = (): typeof jobQueue => jobQueue;

    await harness.installPlugin(entityPlugin);
    if (!interceptor) throw new Error("Create interceptor was not registered");

    await interceptor(
      { entityType: "bookmark", prompt: "save this" },
      executionContext,
    );

    expect(enqueued).toEqual(["@fixture/bookmarks:capture:capture-bookmark"]);
    harness.reset();
  });

  // The entity-side `publish` slot takes a static provider, which is enough
  // for a package that publishes to the site itself. A provider built from
  // credentials cannot be static, so the service half declares it — the same
  // reason `jobs` and `evals` are functions of config and the entity-side
  // slots are not.
  describe("a publish provider built from config", () => {
    const linkedish = {
      name: "linkedish",
      publish: async (): Promise<{ id: string }> => ({ id: "remote-1" }),
    };

    function definePublishingPackage(): ReturnType<typeof defineServicePlugin> {
      return defineServicePlugin({
        id: "bookmarks",
        config: z.object({ accessToken: z.string().optional() }),
        entities: [bookmark],
        publish: ({ config }) =>
          config.accessToken
            ? [
                {
                  entityType: "bookmark",
                  provider: linkedish,
                  resultIdField: "platformPostId",
                },
              ]
            : [],
      });
    }

    async function installWith(config: object): Promise<{
      registered: unknown[];
      harness: ReturnType<typeof createPluginHarness>;
    }> {
      const plugins = instantiatePluginPackageDefinition(
        definePublishingPackage(),
        config,
        { name: "@fixture/bookmarks", version: "0.1.0" },
      );
      const harness = createPluginHarness({
        logger: createSilentLogger("service-publish-test"),
      });
      const registered: unknown[] = [];
      harness.subscribe("publish:register", async (msg) => {
        registered.push(msg.payload);
        return { success: true };
      });
      for (const plugin of plugins) await harness.installPlugin(plugin);
      return { registered, harness };
    }

    it("announces the provider once the pipeline is listening", async () => {
      const { registered, harness } = await installWith({
        accessToken: "token-1",
      });

      // Same deferral the entity slot makes: nothing is announced before the
      // pipeline has had its chance to subscribe.
      expect(registered).toHaveLength(0);

      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});

      expect(registered).toEqual([
        {
          entityType: "bookmark",
          provider: linkedish,
          config: { publishResultIdField: "platformPostId" },
        },
      ]);

      harness.reset();
    });

    it("announces nothing when config supplies no credentials", async () => {
      const { registered, harness } = await installWith({});

      await harness.sendMessage(SYSTEM_CHANNELS.pluginsRegistered, {});

      expect(registered).toEqual([]);

      harness.reset();
    });
  });

  // An insight a service contributes is built from config, the same reason
  // jobs and evals are: analytics reports traffic through a client it only
  // has when credentials are configured.
  it("registers insights built from config", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ label: z.string().default("anonymous") }),
      insights: ({ config }) => ({
        "bookmark-source": async (): Promise<Record<string, unknown>> => ({
          source: config.label,
        }),
      }),
    });
    const plugins = instantiatePluginPackageDefinition(
      definition,
      { label: "shared" },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    );
    const plugin = plugins[0];
    if (!plugin) throw new Error("Service plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("service-insights-test"),
    });
    await harness.installPlugin(plugin);

    const registry = harness.getMockShell().getInsightsRegistry();
    expect(registry.getTypes()).toContain("bookmark-source");
    expect(
      await registry.get(
        "bookmark-source",
        harness.getEntityService(),
        "public",
      ),
    ).toEqual({ source: "shared" });

    harness.reset();
  });

  // A projection rule that reads configuration cannot be static entity
  // data. Declared on the service half, each rule joins the entity plugin
  // whose type it targets, so the runtime still sees it as that entity's.
  // A rule that generates has to name a template, and the runtime scopes
  // template names itself. Left to hardcode the prefix, a package writes a
  // name that silently stops resolving the moment its scope changes — which
  // surfaces as "Template not found" at derive time, not at registration.
  it("hands projection rules the scoped name of a template the package declares", async () => {
    const summarised = defineEntity({
      type: "summary",
      purpose: "A generated summary.",
      metadata: z.object({}),
      templates: {
        extraction: createTemplate({
          name: "extraction",
          description: "Extraction prompt",
          schema: z.object({ topics: z.array(z.string()) }),
          requiredPermission: "public",
        }),
      },
    });
    let namedTemplate = "";
    const definition = defineServicePlugin({
      id: "summaries",
      config: z.object({}),
      entities: [summarised],
      projectionRules: ({ template }) => {
        namedTemplate = template("extraction");
        return [];
      },
    });

    instantiatePluginPackageDefinition(
      definition,
      {},
      { name: "@fixture/summaries", version: "0.1.0" },
    );

    expect(namedTemplate).toBe("@fixture/summaries:summary:extraction");
  });

  it("attaches config-derived projection rules to the entity they target", async () => {
    const definition = defineServicePlugin({
      id: "bookmarks",
      config: z.object({ extract: z.boolean().default(true) }),
      entities: [bookmark],
      projectionRules: ({ config }) =>
        config.extract
          ? [
              defineProjectionRule({
                id: "bookmark-extraction",
                version: "1",
                sources: [{ kind: "entity", types: ["*"] }],
                targetType: "bookmark",
                inputSchema: z.object({}),
                selectInput: async () => ({}),
                derive: async () => [],
              }),
            ]
          : [],
    });

    const enabled = instantiatePluginPackageDefinition(
      definition,
      { extract: true },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    ).find((plugin) => plugin.type === "entity");
    if (!enabled) throw new Error("Bookmark entity plugin was not created");

    const harness = createPluginHarness({
      logger: createSilentLogger("service-projection-rules-test"),
    });
    const capabilities = await harness.installPlugin(enabled);
    expect(capabilities.projectionRules?.map(({ id }) => id)).toEqual([
      "bookmark-extraction",
    ]);
    harness.reset();

    // Configuration decides whether the rule exists at all.
    const disabled = instantiatePluginPackageDefinition(
      definition,
      { extract: false },
      { name: "@fixture/bookmarks", version: "0.1.0" },
    ).find((plugin) => plugin.type === "entity");
    if (!disabled) throw new Error("Bookmark entity plugin was not created");

    const second = createPluginHarness({
      logger: createSilentLogger("service-projection-rules-off"),
    });
    expect(
      (await second.installPlugin(disabled)).projectionRules,
    ).toBeUndefined();
    second.reset();
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
