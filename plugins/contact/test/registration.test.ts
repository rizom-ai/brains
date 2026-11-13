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
import { createContactPlugins } from "./contact-plugins";

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
  const plugins = createContactPlugins();
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
 * What the contact package registers, pinned as its contact-request entity
 * plugin class and its contact service class (the forms engine's
 * FormPlugin) registered it: the contact form's pages and routes, the
 * owner's alert job, the daily maintenance, the intake's health, its
 * endpoint and the Contact requests Inbox source.
 */
describe("the contact package's registered surface", () => {
  it("is the contact-request entity and the contact service, with no tools", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      ["contact-request", "entity", "@brains/contact", []],
      [
        "contact",
        "service",
        "@brains/contact",
        [
          "contact-request",
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

  it("registers the contact-request type: restricted, never indexed or projected", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getEntityTypeConfig("contact-request")).toMatchObject({
      embeddable: false,
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(registry.getPersistValidator("contact-request")).toBeFunction();
  });

  it("serves the contact form, its thanks page and content's forms, public and on the preview host", async () => {
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
        path: "/contact",
        method: "GET",
        match: undefined,
        role: "contact-form",
        public: true,
        preview: true,
      },
      {
        path: "/contact",
        method: "POST",
        match: undefined,
        role: "contact-form",
        public: true,
        preview: true,
      },
      {
        path: "/contact/thanks",
        method: "GET",
        match: undefined,
        role: undefined,
        public: true,
        preview: true,
      },
      {
        path: "/_forms/contact",
        method: "GET",
        match: "claim",
        role: undefined,
        public: true,
        preview: true,
      },
      {
        path: "/_forms/contact",
        method: "POST",
        match: "claim",
        role: undefined,
        public: true,
        preview: true,
      },
    ]);
  });

  it("declares its pages, template, alert job and maintenance in every process", async () => {
    for (const executionOnly of [false, true]) {
      const brain = await installed({ executionOnly });
      expect([...brain.shell.getTemplates().keys()]).toContain("contact:page");
      expect(brain.routeRegistrations).toEqual([
        {
          pluginId: "contact",
          routes: [
            {
              id: "contact",
              path: "/contact",
              title: "Contact",
              description: "",
              sections: [
                {
                  id: "form",
                  template: "contact:page",
                  content: { slot: "contact" },
                },
              ],
              layout: "default",
              navigation: { show: false, slot: "primary", priority: 50 },
            },
            {
              id: "contact-thanks",
              path: "/contact/thanks",
              title: "Note saved",
              description: "",
              sections: [
                {
                  id: "form",
                  template: "contact:page",
                  content: { slot: "contact" },
                },
              ],
              layout: "default",
              navigation: { show: false, slot: "primary", priority: 50 },
            },
          ],
        },
      ]);
      expect(
        brain.shell
          .getMessageBus()
          .getHandlerCount(siteBuilderPagesContract.name),
      ).toBe(1);
      expect(brain.handlers).toEqual([
        'contact:notify {"executionTimeoutMs":60000}',
      ]);
      expect(
        brain.shell.getRecurringCheck("contact:maintenance"),
      ).toMatchObject({
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: false,
      });
    }
  });

  it("offers its Inbox source, health, endpoint and listeners in the main process, and none in a worker", async () => {
    const main = await installed();
    main.shell.getInboxRegistry().finalize();
    expect(
      main.shell
        .getInboxRegistry()
        .listSources()
        .map(({ sourceId }) => sourceId),
    ).toEqual(["contact-requests"]);
    expect(
      (await main.shell.getOperationalHealthRegistry().getChecks()).map(
        ({ name }) => name,
      ),
    ).toEqual(["contact:intake"]);
    for (const channel of channels) {
      expect(main.shell.getMessageBus().getHandlerCount(channel)).toBe(1);
    }
    expect(main.shell.listEndpoints()).toEqual([
      {
        pluginId: "contact",
        label: "Contact",
        url: "https://brain.test/contact",
        priority: 50,
        visibility: "public",
      },
    ]);

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
      new Error("Contact Inbox unavailable"),
    );
    const worker = await installed({ executionOnly: true });
    expect(await worker.plugins[1]?.ready?.()).toBeUndefined();
    for (const plugin of [...main.plugins, ...worker.plugins])
      await plugin.shutdown?.();
  });

  it("takes its health and its maintenance check off when it shuts down", async () => {
    const main = await installed();
    for (const plugin of main.plugins) await plugin.shutdown?.();
    expect(main.shell.getRecurringCheck("contact:maintenance")).toBeUndefined();
    expect(await main.shell.getOperationalHealthRegistry().getChecks()).toEqual(
      [],
    );
  });
});
