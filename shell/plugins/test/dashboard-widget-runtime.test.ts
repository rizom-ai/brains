import { describe, expect, it } from "bun:test";
import { DASHBOARD_CHANNELS } from "@brains/contracts";
import { createMockShell, createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import {
  DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
  STUDIO_OVERVIEW_REGISTER_MESSAGE,
  STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
  defineAccountSettings,
  defineDashboardWidget,
  defineEntity,
  defineJob,
  defineServicePlugin,
  instantiatePluginPackageDefinition,
  type AccountSettingsBackend,
  type AccountSettingsStoredValues,
  type DashboardWidgetProviderContext,
  type DashboardWidgetRegistration,
  type StoredAccountSettings,
} from "../src";
import { safeParseRuntimeDashboardOperatorView } from "../src/operator/operator-view-runtime";

const readingItem = defineEntity({
  type: "reading-item",
  purpose: "A saved reading item",
  metadata: z.object({ title: z.string() }),
});

function accountBackend(
  valuesByActor: Readonly<Record<string, AccountSettingsStoredValues>>,
): AccountSettingsBackend {
  const stored = (actorId: string): StoredAccountSettings | null => {
    const values = valuesByActor[actorId];
    return values ? { values, revision: 1 } : null;
  };
  return {
    read: async ({ actorId }) => stored(actorId),
    list: async () =>
      Object.entries(valuesByActor).map(([actorId, values]) => ({
        actorId,
        values,
        revision: 1,
      })),
    write: async ({ actorId }, values) =>
      stored(actorId) ?? { values, revision: 1 },
    delete: async () => false,
    deleteActor: async () => 0,
  };
}

function instantiate(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
): NonNullable<ReturnType<typeof instantiatePluginPackageDefinition>[number]> {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reading-operator", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Service plugin was not created");
  return plugin;
}

type HostRegistration = DashboardWidgetRegistration & {
  readonly pluginId: string;
};

describe("declarative dashboard widget runtime", () => {
  it("registers after setup and supplies caller-scoped entities and redacted settings", async () => {
    const settings = defineAccountSettings({
      title: "Reading provider",
      schema: z.object({ endpoint: z.url(), token: z.string() }),
      fields: {
        endpoint: { label: "Endpoint", control: "url" },
        token: { label: "Token", secret: true },
      },
    });
    const widget = defineDashboardWidget({
      id: "library",
      title: "Reading library",
      group: "knowledge",
      placement: "secondary",
      priority: 20,
      permission: "trusted",
      data: z.object({
        title: z.string(),
        connected: z.boolean(),
        count: z.number(),
      }),
      digest: ({ data }) => ({
        items: [{ label: "Saved", value: String(data.count) }],
        attention: 0,
      }),
      view: ({ data }) => ({
        title: data.title,
        blocks: [
          {
            type: "stats",
            items: [{ label: "Saved", value: data.count, tone: "good" }],
          },
          {
            type: "links",
            items: [
              {
                label: "Reading source",
                target: { external: "https://reading.example/library" },
              },
            ],
          },
        ],
      }),
    });
    const definition = defineServicePlugin({
      id: "reading-operator",
      config: z.object({}),
      accountSettings: settings,
      setup: () => ({ title: "My library" }),
      dashboardWidgets: (context) => [
        widget.bind(context, async ({ entities, settings: current }) => ({
          title: context.state.title,
          connected:
            current?.endpoint === "https://reading.example" &&
            !Object.hasOwn(current, "token"),
          count: (await entities.list(readingItem)).length,
        })),
      ],
    });

    const logger = createSilentLogger("declarative-dashboard-runtime");
    const shell = createMockShell({ logger });
    shell.getAccountSettingsRegistry().bindBackend(
      accountBackend({
        "actor-1": {
          endpoint: "https://reading.example",
          token: "never-serialize-me",
        },
      }),
    );
    shell.addEntities([
      {
        id: "saved-1",
        entityType: "reading-item",
        content: "Saved",
        visibility: "shared",
        metadata: { title: "Saved" },
        contentHash: "hash",
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
      },
      {
        id: "private-1",
        entityType: "reading-item",
        content: "Private",
        visibility: "restricted",
        metadata: { title: "Private" },
        contentHash: "private-hash",
        created: new Date(0).toISOString(),
        updated: new Date(0).toISOString(),
      },
    ]);

    const registrations: HostRegistration[] = [];
    const overviewRegistrations: HostRegistration[] = [];
    const unregistered: string[] = [];
    const overviewUnregistered: string[] = [];
    shell
      .getMessageBus()
      .subscribe<HostRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        (message) => {
          registrations.push(message.payload);
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe<HostRegistration>(
        STUDIO_OVERVIEW_REGISTER_MESSAGE,
        (message) => {
          overviewRegistrations.push(message.payload);
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe<{ widgetId?: string }>(
        DASHBOARD_CHANNELS.unregisterWidget,
        (message) => {
          if (message.payload.widgetId) {
            unregistered.push(message.payload.widgetId);
          }
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe<{ contributionId?: string }>(
        STUDIO_OVERVIEW_UNREGISTER_MESSAGE,
        (message) => {
          if (message.payload.contributionId) {
            overviewUnregistered.push(message.payload.contributionId);
          }
          return { success: true };
        },
      );

    const plugin = instantiate(definition);
    await plugin.register(shell);
    expect(registrations).toHaveLength(0);
    await plugin.finalizeRegistration?.();

    const registration = registrations[0];
    expect(registration).toMatchObject({
      id: "library",
      title: "Reading library",
      group: "knowledge",
      section: "secondary",
      priority: 20,
      visibility: "trusted",
      rendererName: DECLARATIVE_DASHBOARD_WIDGET_RENDERER,
    });
    if (!registration) throw new Error("Widget was not registered");
    expect(overviewRegistrations).toEqual([registration]);

    const result = await registration.dataProvider({
      caller: {
        actor: { id: "actor-1", displayName: "Reader" },
        permission: "trusted",
        isAnchor: false,
      },
      signal: new AbortController().signal,
    });
    expect(result).toEqual({
      view: {
        title: "My library",
        blocks: [
          {
            type: "stats",
            items: [{ label: "Saved", value: 1, tone: "good" }],
          },
          {
            type: "links",
            items: [
              {
                label: "Reading source",
                target: {
                  kind: "external",
                  href: "https://reading.example/library",
                },
              },
            ],
          },
        ],
      },
      digest: {
        items: [{ label: "Saved", value: "1" }],
        attention: 0,
      },
    });
    expect(registration.digestProvider?.(result)).toEqual({
      digest: [{ label: "Saved", value: "1", tone: "plain" }],
      needsAttention: 0,
    });
    await plugin.shutdown?.();
    expect(unregistered).toEqual(["library"]);
    expect(overviewUnregistered).toEqual(["library"]);
  });

  it("enqueues imported typed jobs through the owning service binding", async () => {
    const refreshDigest = defineJob({
      name: "refresh-digest",
      input: z.object({ actorId: z.string() }),
      output: z.object({ refreshed: z.boolean() }),
    });
    const widget = defineDashboardWidget({
      id: "job-backed",
      title: "Job backed",
      group: "knowledge",
      placement: "secondary",
      permission: "trusted",
      data: z.object({ jobId: z.string() }),
      view: ({ data }) => ({
        blocks: [
          {
            type: "key-values",
            items: [{ label: "Job", value: data.jobId }],
          },
        ],
      }),
    });
    const definition = defineServicePlugin({
      id: "job-backed-operator",
      config: z.object({}),
      jobs: () => [refreshDigest.handle(async () => ({ refreshed: true }))],
      dashboardWidgets: (context) => [
        widget.bind(context, async ({ caller, jobs }) => {
          const reference = await jobs.enqueue(refreshDigest, {
            actorId: caller?.actor.id ?? "public",
          });
          return { jobId: reference.id };
        }),
      ],
    });
    const shell = createMockShell({
      logger: createSilentLogger("dashboard-typed-job"),
    });
    const registrations: HostRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<HostRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        (message) => {
          registrations.push(message.payload);
          return { success: true };
        },
      );

    const plugin = instantiate(definition);
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();
    const registration = registrations[0];
    if (!registration) throw new Error("Widget was not registered");

    const result = await registration.dataProvider({
      caller: {
        actor: { id: "actor-1" },
        permission: "trusted",
        isAnchor: false,
      },
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      view: {
        blocks: [
          {
            type: "key-values",
            items: [{ label: "Job", value: expect.stringContaining("job-") }],
          },
        ],
      },
    });
    await plugin.shutdown?.();
  });

  it("reports bounded author diagnostics for invalid data and unsafe views", async () => {
    const invalidDataWidget = defineDashboardWidget({
      id: "invalid-data",
      title: "Invalid data",
      group: "knowledge",
      placement: "primary",
      permission: "public",
      data: z.object({ count: z.coerce.number() }),
      view: () => ({ blocks: [] }),
    });
    const unsafeViewWidget = defineDashboardWidget({
      id: "unsafe-view",
      title: "Unsafe view",
      group: "knowledge",
      placement: "primary",
      permission: "public",
      data: z.object({ count: z.number() }),
      view: () => ({
        blocks: [
          {
            type: "links",
            items: [
              { label: "Unsafe", target: { external: "javascript:alert(1)" } },
            ],
          },
        ],
      }),
    });
    const invalidSpatialWidget = defineDashboardWidget({
      id: "invalid-spatial",
      title: "Invalid spatial",
      group: "knowledge",
      placement: "primary",
      permission: "public",
      data: z.object({}),
      view: () => ({
        blocks: [
          {
            type: "spatial",
            layout: "radial",
            id: "map",
            label: "Invalid map",
            description: "A map with a dangling relationship.",
            centerLabel: "Center",
            centerKind: "centroid",
            points: [
              {
                id: "point-a",
                label: "Point A",
                kind: "agent",
                status: "active",
                distance: 0.5,
                bearing: 90,
                relatedIds: ["missing-point"],
              },
            ],
            relationships: [{ sourceId: "point-a", targetId: "missing-point" }],
            strata: [{ id: "far", label: "Far", maxDistance: 1 }],
            legend: [],
          },
        ],
      }),
    });
    const definition = defineServicePlugin({
      id: "invalid-operator",
      config: z.object({}),
      dashboardWidgets: (context) => [
        invalidDataWidget.bind(context, () => ({ count: "wrong" })),
        unsafeViewWidget.bind(context, () => ({ count: 1 })),
        invalidSpatialWidget.bind(context, () => ({})),
      ],
    });
    const shell = createMockShell({
      logger: createSilentLogger("invalid-dashboard-runtime"),
    });
    const registrations = new Map<string, HostRegistration>();
    shell
      .getMessageBus()
      .subscribe<HostRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        (message) => {
          registrations.set(message.payload.id, message.payload);
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe(DASHBOARD_CHANNELS.unregisterWidget, () => ({
        success: true,
      }));

    const plugin = instantiate(definition);
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();
    const providerContext: DashboardWidgetProviderContext = {
      caller: null,
      signal: new AbortController().signal,
    };

    expect(
      registrations.get("invalid-data")?.dataProvider(providerContext),
    ).rejects.toThrow(
      'Service "invalid-operator" package "@fixture/reading-operator" dashboard widget "invalid-data" returned invalid data',
    );
    expect(
      registrations.get("unsafe-view")?.dataProvider(providerContext),
    ).rejects.toThrow(
      'dashboard widget "unsafe-view" returned an invalid view',
    );
    expect(
      registrations.get("invalid-spatial")?.dataProvider(providerContext),
    ).rejects.toThrow("Related point");
    await plugin.shutdown?.();
  });

  it("rejects host-normalized links and Studio-only launch intents from author views", () => {
    const normalized = safeParseRuntimeDashboardOperatorView({
      blocks: [
        {
          type: "links",
          items: [
            {
              label: "Forged",
              target: {
                kind: "entity",
                entityType: "private-record",
                id: "forged",
              },
            },
          ],
        },
      ],
    });
    expect(normalized).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "items", 0, "target"],
          message: expect.stringContaining("normalized host target"),
        },
      ],
    });

    const studioOnly = safeParseRuntimeDashboardOperatorView({
      blocks: [
        {
          type: "links",
          items: [
            {
              label: "Capture",
              target: {
                launch: {
                  target: "inbox-capture-note",
                  title: "Captured",
                  entityType: "mail-item",
                  entityId: "mail-1",
                },
              },
            },
          ],
        },
      ],
    });
    expect(studioOnly).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "items", 0, "target", "launch", "target"],
          message: expect.stringContaining("only in Studio workspaces"),
        },
      ],
    });

    // Dashboard composes no detail blocks, so a detail target has no enclosing
    // master to open and is rejected wherever it appears.
    const detailOnly = safeParseRuntimeDashboardOperatorView({
      blocks: [
        {
          type: "links",
          items: [
            {
              label: "Read original",
              target: { detail: { itemId: "mail-1" } },
            },
          ],
        },
      ],
    });
    expect(detailOnly).toMatchObject({
      success: false,
      issues: [
        {
          path: ["blocks", 0, "items", 0, "target"],
          message: expect.stringContaining("detail block's master"),
        },
      ],
    });
  });

  it("accepts complete list facets beyond the legacy 50-option boundary", () => {
    const tags = Array.from(
      { length: 60 },
      (_, index) => `tag-${String(index + 1).padStart(2, "0")}`,
    );
    const parsed = safeParseRuntimeDashboardOperatorView({
      blocks: [
        {
          type: "list",
          id: "skills",
          empty: "No skills.",
          filter: {
            label: "Filter skills by tag",
            defaultValue: "all",
            allValue: "all",
            options: [
              { value: "all", label: "all" },
              ...tags.map((tag) => ({ value: tag, label: tag })),
            ],
          },
          items: [
            {
              id: "skill-1",
              title: "Skill",
              filterValues: tags.slice(0, 30),
            },
          ],
        },
      ],
    });

    expect(parsed).toMatchObject({ success: true });
  });

  it("keeps complete list facets bounded by the list membership space", () => {
    const parsed = safeParseRuntimeDashboardOperatorView({
      blocks: [
        {
          type: "list",
          id: "skills",
          empty: "No skills.",
          filter: {
            label: "Filter skills by tag",
            defaultValue: "tag-0",
            options: Array.from({ length: 10_002 }, (_, index) => ({
              value: `tag-${index}`,
              label: `Tag ${index}`,
            })),
          },
          items: [],
        },
      ],
    });

    expect(parsed).toMatchObject({ success: false });
  });

  it("rejects duplicate local widget IDs before host registration", async () => {
    const widget = defineDashboardWidget({
      id: "duplicate",
      title: "Duplicate",
      group: "knowledge",
      placement: "secondary",
      permission: "public",
      data: z.object({}),
      view: () => ({ blocks: [] }),
    });
    const definition = defineServicePlugin({
      id: "duplicate-operator",
      config: z.object({}),
      dashboardWidgets: (context) => [
        widget.bind(context, () => ({})),
        widget.bind(context, () => ({})),
      ],
    });
    const shell = createMockShell({
      logger: createSilentLogger("dashboard-duplicate"),
    });
    let registrations = 0;
    shell.getMessageBus().subscribe(DASHBOARD_CHANNELS.registerWidget, () => {
      registrations += 1;
      return { success: true };
    });

    const plugin = instantiate(definition);
    await plugin.register(shell);
    expect(plugin.finalizeRegistration?.()).rejects.toThrow(
      'Service "duplicate-operator" package "@fixture/reading-operator" registers dashboard widget "duplicate" more than once',
    );
    expect(registrations).toBe(0);
  });

  it("rolls back earlier widgets when host registration fails", async () => {
    const first = defineDashboardWidget({
      id: "first",
      title: "First",
      group: "knowledge",
      placement: "primary",
      permission: "public",
      data: z.object({}),
      view: () => ({ blocks: [] }),
    });
    const second = defineDashboardWidget({
      id: "second",
      title: "Second",
      group: "knowledge",
      placement: "secondary",
      permission: "public",
      data: z.object({}),
      view: () => ({ blocks: [] }),
    });
    const definition = defineServicePlugin({
      id: "rollback-operator",
      config: z.object({}),
      dashboardWidgets: (context) => [
        first.bind(context, () => ({})),
        second.bind(context, () => ({})),
      ],
    });
    const shell = createMockShell({
      logger: createSilentLogger("dashboard-rollback"),
    });
    const registered: string[] = [];
    const unregistered: string[] = [];
    shell
      .getMessageBus()
      .subscribe<HostRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        (message) => {
          registered.push(message.payload.id);
          return message.payload.id === "second"
            ? { success: false, error: "host rejected widget" }
            : { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe<{ widgetId?: string }>(
        DASHBOARD_CHANNELS.unregisterWidget,
        (message) => {
          if (message.payload.widgetId) {
            unregistered.push(message.payload.widgetId);
          }
          return { success: true };
        },
      );

    const plugin = instantiate(definition);
    await plugin.register(shell);
    expect(plugin.finalizeRegistration?.()).rejects.toThrow(
      'dashboard widget "second" host registration failed',
    );
    expect(registered).toEqual(["first", "second"]);
    expect(unregistered).toEqual(["first"]);
    await plugin.shutdown?.();
  });

  it("does not bind or register operator callbacks in execution-only workers", async () => {
    const widget = defineDashboardWidget({
      id: "worker-excluded",
      title: "Worker excluded",
      group: "system",
      placement: "sidebar",
      permission: "public",
      data: z.object({}),
      view: () => ({ blocks: [] }),
    });
    let factories = 0;
    let registrations = 0;
    const definition = defineServicePlugin({
      id: "worker-operator",
      config: z.object({}),
      dashboardWidgets: (context) => {
        factories += 1;
        return [widget.bind(context, () => ({}))];
      },
      studioWorkspaces: () => {
        factories += 1;
        return [];
      },
    });
    const shell = createMockShell({
      logger: createSilentLogger("dashboard-worker-exclusion"),
    });
    shell.getMessageBus().subscribe(DASHBOARD_CHANNELS.registerWidget, () => {
      registrations += 1;
      return { success: true };
    });

    const plugin = instantiate(definition);
    await plugin.register(shell, { executionOnly: true });
    await plugin.finalizeRegistration?.();

    expect(factories).toBe(0);
    expect(registrations).toBe(0);
    await plugin.shutdown?.();
  });

  it("aborts in-flight providers and unregisters during shutdown", async () => {
    const widget = defineDashboardWidget({
      id: "slow",
      title: "Slow",
      group: "system",
      placement: "sidebar",
      permission: "public",
      data: z.object({ done: z.boolean() }),
      view: () => ({ blocks: [] }),
    });
    const definition = defineServicePlugin({
      id: "slow-operator",
      config: z.object({}),
      dashboardWidgets: (context) => [
        widget.bind(
          context,
          ({ signal }) =>
            new Promise<{ done: boolean }>((resolve, reject) => {
              const onAbort = (): void => reject(signal.reason);
              signal.addEventListener("abort", onAbort, { once: true });
              void resolve;
            }),
        ),
      ],
    });
    const shell = createMockShell({
      logger: createSilentLogger("dashboard-shutdown"),
    });
    const registrations: HostRegistration[] = [];
    shell
      .getMessageBus()
      .subscribe<HostRegistration>(
        DASHBOARD_CHANNELS.registerWidget,
        (message) => {
          registrations.push(message.payload);
          return { success: true };
        },
      );
    shell
      .getMessageBus()
      .subscribe(DASHBOARD_CHANNELS.unregisterWidget, () => ({
        success: true,
      }));

    const plugin = instantiate(definition);
    await plugin.register(shell);
    await plugin.finalizeRegistration?.();
    const registration = registrations[0];
    if (!registration) throw new Error("Widget was not registered");
    const pending = registration.dataProvider({
      caller: null,
      signal: new AbortController().signal,
    });
    const shutdown = plugin.shutdown?.();
    expect(pending).rejects.toThrow("shutting down");
    await shutdown;
  });
});
