import { describe, expect, expectTypeOf, it } from "bun:test";
import { z } from "@brains/utils/zod";
import {
  defineAccountSettings,
  defineStudioWorkspace,
  defineDashboardWidget,
  defineServicePlugin,
  defineWorkspaceAction,
} from "../src";
import {
  getStudioWorkspaceExecutor,
  getDashboardWidgetLoader,
} from "../src/operator/operator-definition-contract";
import type { OperatorBaseContext } from "../src/operator/operator-context-contract";
import { getWorkspaceActionExecutor } from "../src/operator/workspace-action-definition-contract";

const accountSettings = defineAccountSettings({
  title: "Reading provider",
  schema: z.object({ endpoint: z.url(), token: z.string() }),
  fields: {
    endpoint: { label: "Endpoint", control: "url" },
    token: { label: "Token", secret: true },
  },
});

const refresh = defineWorkspaceAction({
  name: "refresh",
  label: "Refresh",
  input: z.object({ id: z.string() }),
  output: z.object({ refreshed: z.string() }),
  permission: "trusted",
});

const workspace = defineStudioWorkspace({
  id: "library",
  label: "Library",
  permission: "trusted",
  data: z.object({ count: z.number() }),
  actions: [refresh],
  view: ({ data }) => ({
    title: `${data.count} saved`,
    blocks: [
      {
        type: "action",
        action: refresh,
        input: { id: "saved" },
      },
    ],
  }),
});

const widget = defineDashboardWidget({
  id: "library",
  title: "Library",
  group: "knowledge",
  placement: "secondary",
  permission: "trusted",
  data: z.object({ label: z.string(), count: z.number() }),
  digest: ({ data }) => ({
    items: [{ label: data.label, value: String(data.count) }],
    attention: data.count,
  }),
  view: ({ data }) => ({
    blocks: [
      {
        type: "stats",
        items: [{ label: data.label, value: data.count }],
      },
    ],
  }),
});

describe("public operator definitions", () => {
  it("keeps contracts at module scope and infers factory-bound executors", () => {
    const definition = defineServicePlugin({
      id: "reading-operator",
      config: z.object({ prefix: z.string() }),
      accountSettings,
      setup: ({ config }) => ({ offset: config.prefix.length }),
      dashboardWidgets: (context) => {
        expectTypeOf(context.accountSettings).toEqualTypeOf<
          typeof accountSettings
        >();
        return [
          widget.bind(context, async ({ config, state, settings }) => {
            expectTypeOf(config.prefix).toEqualTypeOf<string>();
            expectTypeOf(state.offset).toEqualTypeOf<number>();
            // The token field is declared secret, so operator callbacks never
            // receive it: view data is serialized to the browser.
            expectTypeOf(settings).toEqualTypeOf<{
              endpoint: string;
            } | null>();
            return {
              label: settings?.endpoint ?? config.prefix,
              count: state.offset,
            };
          }),
        ];
      },
      studioWorkspaces: (context) => {
        const action = refresh.bind(context, ({ input, config, state }) => ({
          refreshed: `${config.prefix}:${input.id}:${state.offset}`,
        }));
        return [
          workspace.bind(context, {
            actions: [action],
            load: ({ state }) => ({ count: state.offset }),
          }),
        ];
      },
    });

    expect(definition.family).toBe("service");
    expect(Object.isFrozen(widget)).toBeTrue();
    expect(Object.isFrozen(workspace)).toBeTrue();
    expect(Object.isFrozen(refresh)).toBeTrue();
    expect(Object.isFrozen(accountSettings)).toBeTrue();
    expect(Object.isFrozen(accountSettings.fields.token)).toBeTrue();
  });

  it("stores bound executors outside immutable definition values", async () => {
    const bindingContext = {
      config: { prefix: "read" },
      state: { offset: 4 },
      accountSettings,
    };
    const widgetBinding = widget.bind(bindingContext, ({ config, state }) => ({
      label: config.prefix,
      count: state.offset,
    }));
    const actionBinding = refresh.bind(bindingContext, ({ input }) => ({
      refreshed: input.id,
    }));
    const workspaceBinding = workspace.bind(bindingContext, {
      actions: [actionBinding],
      load: ({ state }) => ({ count: state.offset }),
    });
    const runtimeContext: OperatorBaseContext<
      { prefix: string },
      { offset: number },
      typeof accountSettings
    > = {
      config: bindingContext.config,
      state: bindingContext.state,
      caller: null,
      settings: { endpoint: "https://example.com" },
      entities: {
        get: async () => null,
        list: async () => [],
        search: async () => [],
      },
      corpus: {
        project: async () => ({
          origin: { kind: "centroid" },
          points: [],
          neighbors: [],
          distanceRange: { min: 0, max: 0 },
        }),
        listEntities: async () => [],
      },
      jobs: {
        enqueue: async () => ({ id: "job-1", status: async () => null }),
        status: async () => null,
      },
      permissions: { allows: () => true },
      signal: new AbortController().signal,
    };

    expect(
      await getDashboardWidgetLoader(widgetBinding)(runtimeContext),
    ).toEqual({ label: "read", count: 4 });
    expect(
      await getWorkspaceActionExecutor(actionBinding).execute({
        ...runtimeContext,
        input: { id: "saved" },
      }),
    ).toEqual({ refreshed: "saved" });
    expect(
      await getStudioWorkspaceExecutor(workspaceBinding).load({
        ...runtimeContext,
        query: {
          get: (schema) => schema.parse({}),
        },
      }),
    ).toEqual({ count: 4 });
    expect(widget).not.toHaveProperty("load");
    expect(refresh).not.toHaveProperty("execute");
  });

  it("rejects malformed contracts before plugin setup", () => {
    expect(() =>
      Reflect.apply(defineAccountSettings, undefined, [
        {
          title: "Settings",
          schema: z.object({ known: z.string() }),
          fields: { unknown: { label: "Unknown" } },
        },
      ]),
    ).toThrow('field "unknown" is not declared');

    expect(() =>
      Reflect.apply(defineAccountSettings, undefined, [
        {
          title: "Settings",
          schema: z.object({ known: z.string() }),
          fields: { known: { label: "Known", control: "select" } },
        },
      ]),
    ).toThrow('unsupported control "select"');

    expect(() =>
      defineStudioWorkspace({
        id: "library",
        label: "Library",
        permission: "trusted",
        data: z.object({}),
        actions: [
          defineWorkspaceAction({
            name: "public-action",
            label: "Public action",
            permission: "public",
            input: z.object({}),
            output: z.object({}),
          }),
        ],
        view: () => ({ blocks: [] }),
      }),
    ).toThrow("permission cannot be lower");

    const otherAction = defineWorkspaceAction({
      name: "other",
      label: "Other",
      input: z.object({}),
      output: z.object({}),
      permission: "trusted",
    });
    const bindingContext = {
      config: { prefix: "read" },
      state: { offset: 4 },
      accountSettings,
    };
    expect(() =>
      Reflect.apply(workspace.bind, workspace, [
        bindingContext,
        {
          actions: [
            otherAction.bind(bindingContext, (): Record<never, never> => ({})),
          ],
          load: (): { count: number } => ({ count: 0 }),
        },
      ]),
    ).toThrow('cannot bind undeclared action "other"');

    expect(() =>
      defineDashboardWidget({
        id: "not valid",
        title: "Invalid",
        group: "test",
        placement: "secondary",
        permission: "trusted",
        data: z.object({}),
        view: () => ({ blocks: [] }),
      }),
    ).toThrow("Dashboard widget id");
  });

  it("requires a field declaration for every settings schema key", () => {
    expect(() =>
      Reflect.apply(defineAccountSettings, undefined, [
        {
          title: "Settings",
          schema: z.object({ endpoint: z.url(), token: z.string() }),
          fields: { endpoint: { label: "Endpoint" } },
        },
      ]),
    ).toThrow('schema field "token" has no field declaration');
  });

  it("rejects unbound definitions at executor lookup", () => {
    expect(() =>
      Reflect.apply(getDashboardWidgetLoader, undefined, [
        { kind: "rizom-dashboard-widget-binding", definition: widget },
      ]),
    ).toThrow('Dashboard widget "library" was not bound');
    expect(() =>
      Reflect.apply(getStudioWorkspaceExecutor, undefined, [
        { kind: "rizom-studio-workspace-binding", definition: workspace },
      ]),
    ).toThrow('Studio workspace "library" was not bound');
    expect(() =>
      Reflect.apply(getWorkspaceActionExecutor, undefined, [
        { kind: "rizom-workspace-action-binding", definition: refresh },
      ]),
    ).toThrow('Workspace action "refresh" was not bound');
  });

  it("refuses workspace bindings that leave declared actions unimplemented", () => {
    const bindingContext = {
      config: { prefix: "read" },
      state: { offset: 4 },
      accountSettings,
    };

    expect(() =>
      Reflect.apply(workspace.bind, workspace, [
        bindingContext,
        { actions: [], load: (): { count: number } => ({ count: 0 }) },
      ]),
    ).toThrow('has no executor for action "refresh"');

    const action = refresh.bind(bindingContext, ({ input }) => ({
      refreshed: input.id,
    }));
    expect(() =>
      Reflect.apply(workspace.bind, workspace, [
        bindingContext,
        {
          actions: [action, action],
          load: (): { count: number } => ({ count: 0 }),
        },
      ]),
    ).toThrow('binds action "refresh" more than once');
  });

  it("rejects a workspace declaring the same action twice", () => {
    expect(() =>
      defineStudioWorkspace({
        id: "library",
        label: "Library",
        permission: "trusted",
        data: z.object({}),
        actions: [refresh, refresh],
        view: () => ({ blocks: [] }),
      }),
    ).toThrow('declares action "refresh" more than once');
  });
});
