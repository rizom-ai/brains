import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
  defineServicePlugin,
  defineStudioWorkspace,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
} from "../src";

/**
 * A first-party service that composes one Studio workspace from several
 * declared ones, as admin's Administration composes its tabs: each tab is a
 * source built under the plugin's id and never registered on its own, and
 * the composed workspace is registered with Studio as the class registered
 * it, once every plugin has registered, never in a worker and not without a
 * Studio.
 */

const people = defineStudioWorkspace({
  id: "people",
  label: "People",
  permission: "admin",
  data: z.object({ count: z.number() }),
  actions: [],
  view: ({ data }) => ({
    blocks: [{ type: "text", text: `${data.count} people` }],
  }),
});

const admin: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "admin-user",
  actor: { kind: "user", userId: "admin-user" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

interface Composed {
  readonly available: boolean[];
  readonly urls: (string | undefined)[];
}

async function install(
  shell: MockShell,
  executionOnly = false,
): Promise<Composed> {
  const composed: Composed = { available: [], urls: [] };
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          const runtime = serviceRuntime(context);
          runtime.registered(async () => {
            composed.available.push(runtime.studio.isAvailable());
            if (!runtime.studio.isAvailable()) return;
            const tab = runtime.studio.source({
              definition: people,
              bind: (binding) =>
                people.bind(binding, {
                  load: () => ({ count: 2 }),
                  actions: [],
                }),
            });
            composed.urls.push(
              await runtime.studio.register({
                id: "probe:composed",
                label: "Composed",
                rendererName: DECLARATIVE_STUDIO_WORKSPACE_RENDERER,
                priority: 10,
                permission: "admin",
                urlQuery: true,
                aliases: [{ id: "probe:people", query: { tab: "people" } }],
                entityTypes: [],
                accessHandler: (actor) => tab.accessHandler(actor),
                dataProvider: (actor, query, signal) =>
                  tab.dataProvider(actor, query, signal),
              }),
            );
          });
          return [];
        },
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell, { executionOnly });
  await plugin.finalizeRegistration?.();
  return composed;
}

function studio(shell: MockShell): StudioWorkspaceRegistration[] {
  const registered: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration, { workspaceUrl: string }>(
      "studio:register-workspace",
      (message) => {
        registered.push(message.payload);
        return {
          success: true,
          data: {
            workspaceUrl: `/studio/workspaces/${encodeURIComponent(message.payload.id)}`,
          },
        };
      },
    );
  return registered;
}

describe("a first-party service composing a Studio workspace", () => {
  it("registers the composed workspace with Studio, its tabs under the plugin's id", async () => {
    const shell = createMockShell();
    const registered = studio(shell);
    const composed = await install(shell);

    expect(composed).toEqual({
      available: [true],
      urls: ["/studio/workspaces/probe%3Acomposed"],
    });
    expect(
      registered.map(({ id, pluginId, aliases }) => ({
        id,
        pluginId,
        aliases,
      })),
    ).toEqual([
      {
        id: "probe:composed",
        pluginId: "probe",
        aliases: [{ id: "probe:people", query: { tab: "people" } }],
      },
    ]);
    const [workspace] = registered;
    if (!workspace) throw new Error("Nothing registered");
    expect(await workspace.accessHandler(admin)).toBe(true);
    expect(await workspace.dataProvider(admin, {}, undefined)).toMatchObject({
      view: { blocks: [{ type: "text", text: "2 people" }] },
    });
  });

  it("registers nothing without a Studio", async () => {
    const shell = createMockShell();
    expect(await install(shell)).toEqual({ available: [false], urls: [] });
  });

  it("registers nothing in a worker", async () => {
    const shell = createMockShell();
    const registered = studio(shell);
    expect(await install(shell, true)).toEqual({
      available: [false],
      urls: [],
    });
    expect(registered).toEqual([]);
  });

  it("unregisters a workspace it registered, as its class did when it shut down", async () => {
    const shell = createMockShell();
    studio(shell);
    const unregistered: unknown[] = [];
    shell
      .getMessageBus()
      .subscribe("studio:unregister-workspace", (message) => {
        unregistered.push(message.payload);
        return { success: true };
      });
    let runtime: ReturnType<typeof serviceRuntime> | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            runtime = serviceRuntime(context);
            return [];
          },
        },
      ),
      {},
      { name: "@brains/probe", version: "0.1.0" },
      { pluginId: "probe" },
    );
    await plugin?.register(shell);
    if (!runtime) throw new Error("No runtime");

    expect(await runtime.studio.unregister("probe:site")).toBe(true);
    expect(unregistered).toEqual([
      { pluginId: "probe", workspaceId: "probe:site" },
    ]);
  });

  it("unregisters nothing without a Studio", async () => {
    let runtime: ReturnType<typeof serviceRuntime> | undefined;
    const [plugin] = instantiatePluginPackageDefinition(
      defineServicePlugin(
        { id: "probe", config: z.object({}) },
        {
          subscriptions: (context) => {
            runtime = serviceRuntime(context);
            return [];
          },
        },
      ),
      {},
      { name: "@brains/probe", version: "0.1.0" },
      { pluginId: "probe" },
    );
    await plugin?.register(createMockShell());
    expect(await runtime?.studio.unregister("probe:site")).toBe(false);
  });
});
