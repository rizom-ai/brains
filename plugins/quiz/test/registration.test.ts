import { describe, expect, it, spyOn } from "bun:test";
import { ENTITY_CHANNELS } from "@brains/contracts";
import {
  baseEntitySchema,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  createTestEntityAdapter,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import {
  siteBuilderPagesContract,
  siteBuilderRouteRegisterContract,
  siteMetadataUpdatedChannel,
} from "@brains/site-composition";
import { createQuizPlugins } from "./quiz-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  routeRegistrations: unknown[];
  handlers: string[];
}

/** One brain process with a site, Studio's workspaces and content's forms. */
async function installed(
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell({ domain: "brain.test" });
  spyOn(shell, "getPluginWebRoutes").mockReturnValue([
    {
      pluginId: "studio",
      fullPath: "/studio/workspaces",
      definition: {
        path: "/studio/workspaces",
        method: "GET",
        match: "prefix",
        role: "studio-workspaces",
        public: true,
        handler: (): Response => new Response(),
      },
    },
  ]);
  const handlers: string[] = [];
  spyOn(shell.getJobQueueService(), "registerHandler").mockImplementation(
    (type, handler) => {
      handlers.push(
        `${type} ${JSON.stringify({ executionTimeoutMs: handler.executionTimeoutMs })}`,
      );
    },
  );
  const routeRegistrations: unknown[] = [];
  shell
    .getMessageBus()
    .subscribe(siteBuilderRouteRegisterContract.name, async (message) => {
      routeRegistrations.push(message.payload);
      return { success: true };
    });
  shell
    .getEntityRegistry()
    .registerEntityType(
      "form",
      baseEntitySchema.partial().passthrough(),
      createTestEntityAdapter("form"),
    );
  const plugins = createQuizPlugins();
  const capabilities = await registerAll(shell, plugins, options);
  return { shell, plugins, capabilities, routeRegistrations, handlers };
}

const channels = [
  ENTITY_CHANNELS.created,
  ENTITY_CHANNELS.updated,
  ENTITY_CHANNELS.deleted,
  siteMetadataUpdatedChannel.name,
];

/**
 * What the quiz package registers, pinned as its quiz-result entity plugin
 * class and its quiz service class (the forms engine's FormPlugin)
 * registered it: the routes content's quizzes claim, the owner's alert
 * job, the daily maintenance, the intake's health and the Quiz results
 * Inbox source. It ships no form of its own, so it declares no page or
 * endpoint.
 */
describe("the quiz package's registered surface", () => {
  it("is the quiz-result entity and the quiz service, with no tools", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      ["quiz-result", "entity", "@brains/quiz", []],
      [
        "quiz",
        "service",
        "@brains/quiz",
        [
          "quiz-result",
          "notifications",
          "site-builder",
          "studio",
          "unified-inbox",
        ],
      ],
    ]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers the quiz-result type: restricted, never indexed or projected", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getEntityTypeConfig("quiz-result")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(registry.getPersistValidator("quiz-result")).toBeFunction();
  });

  it("serves the routes content's quizzes claim, public and on the preview host", async () => {
    const { plugins } = await installed();
    const routes = plugins.flatMap((plugin) => plugin.getWebRoutes?.() ?? []);
    expect(
      routes.map(({ path, method, match, role, public: open, preview }) => ({
        path,
        method,
        match,
        role,
        public: open,
        preview,
      })),
    ).toEqual([
      {
        path: "/_forms/quiz",
        method: "GET",
        match: "claim",
        role: undefined,
        public: true,
        preview: true,
      },
      {
        path: "/_forms/quiz",
        method: "POST",
        match: "claim",
        role: undefined,
        public: true,
        preview: true,
      },
    ]);
  });

  it("declares its template, alert job and maintenance, and announces it has no pages, in every process", async () => {
    for (const executionOnly of [false, true]) {
      const brain = await installed({ executionOnly });
      expect([...brain.shell.getTemplates().keys()]).toContain("quiz:page");
      expect(brain.routeRegistrations).toEqual([
        { pluginId: "quiz", routes: [] },
      ]);
      expect(
        brain.shell
          .getMessageBus()
          .getHandlerCount(siteBuilderPagesContract.name),
      ).toBe(1);
      expect(brain.handlers).toEqual([
        'quiz:notify {"executionTimeoutMs":60000}',
      ]);
      expect(brain.shell.getRecurringCheck("quiz:maintenance")).toMatchObject({
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: false,
      });
    }
  });

  it("offers its Inbox source, health and listeners in the main process, and none in a worker", async () => {
    const main = await installed();
    main.shell.getInboxRegistry().finalize();
    expect(
      main.shell
        .getInboxRegistry()
        .listSources()
        .map(({ sourceId }) => sourceId),
    ).toEqual(["quiz-results"]);
    expect(
      (await main.shell.getOperationalHealthRegistry().getChecks()).map(
        ({ name }) => name,
      ),
    ).toEqual(["quiz:intake"]);
    for (const channel of channels) {
      expect(main.shell.getMessageBus().getHandlerCount(channel)).toBe(1);
    }
    expect(main.shell.listEndpoints()).toEqual([]);

    const worker = await installed({ executionOnly: true });
    worker.shell.getInboxRegistry().finalize();
    expect(worker.shell.getInboxRegistry().listSources()).toEqual([]);
    expect(
      await worker.shell.getOperationalHealthRegistry().getChecks(),
    ).toEqual([]);
    for (const channel of channels) {
      expect(worker.shell.getMessageBus().getHandlerCount(channel)).toBe(0);
    }
    expect(worker.shell.listEndpoints()).toEqual([]);
  });

  it("is not ready without the unified Inbox, and a worker never is", async () => {
    const main = await installed();
    const service = main.plugins[1];
    expect(await service?.ready?.().catch((error: unknown) => error)).toEqual(
      new Error("Quiz Inbox unavailable"),
    );
    const worker = await installed({ executionOnly: true });
    expect(await worker.plugins[1]?.ready?.()).toBeUndefined();
    for (const plugin of [...main.plugins, ...worker.plugins])
      await plugin.shutdown?.();
  });

  it("takes its health and its maintenance check off when it shuts down", async () => {
    const main = await installed();
    for (const plugin of main.plugins) await plugin.shutdown?.();
    expect(main.shell.getRecurringCheck("quiz:maintenance")).toBeUndefined();
    expect(await main.shell.getOperationalHealthRegistry().getChecks()).toEqual(
      [],
    );
  });
});
