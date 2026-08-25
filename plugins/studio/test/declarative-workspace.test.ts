import { AuthServicePlugin } from "@brains/auth-service";
import { createTempDataDir } from "@brains/plugins/test";
import {
  defineStudioWorkspace,
  defineServicePlugin,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { afterEach, describe, expect, it } from "bun:test";
import { studioPlugin, type StudioPlugin } from "../src";

const authPlugins: AuthServicePlugin[] = [];
const servicePlugins: Plugin[] = [];

afterEach(async () => {
  for (const plugin of servicePlugins.splice(0).reverse()) {
    await plugin.shutdown?.();
  }
  for (const plugin of authPlugins.splice(0).reverse()) {
    await plugin.shutdown?.();
  }
});

function findRoute(
  plugin: StudioPlugin,
  path: string,
  method: WebRouteDefinition["method"] = "GET",
): WebRouteDefinition {
  const route = plugin
    .getWebRoutes()
    .find(
      (candidate) =>
        candidate.path === path && (candidate.method ?? "GET") === method,
    );
  if (!route) throw new Error(`Missing ${method} route: ${path}`);
  return route;
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json();
}

const refresh = defineWorkspaceAction({
  name: "refresh",
  label: "Refresh",
  permission: "trusted",
  input: z.object({ id: z.string() }),
  output: z.object({ refreshed: z.string() }),
});

const library = defineStudioWorkspace({
  id: "library",
  label: "Reading library",
  permission: "trusted",
  data: z.object({ count: z.number() }),
  actions: [refresh],
  view: ({ data }) => ({
    title: "Reading library",
    blocks: [
      {
        type: "stats",
        items: [{ label: "Saved", value: data.count }],
      },
      {
        type: "action",
        action: refresh,
        input: { id: "saved-1" },
      },
    ],
  }),
});

const definition = defineServicePlugin({
  id: "reading-operator",
  config: z.object({}),
  setup: () => ({ count: 3 }),
  studioWorkspaces: (context) => {
    const action = refresh.bind(context, ({ input }) => ({
      refreshed: input.id,
    }));
    return [
      library.bind(context, {
        actions: [action],
        load: ({ state }) => ({ count: state.count }),
      }),
    ];
  },
});

function instantiateService(): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    {},
    { name: "@fixture/reading-operator", version: "0.1.0" },
  );
  if (!plugin) throw new Error("Service plugin was not created");
  servicePlugins.push(plugin);
  return plugin;
}

describe("public declarative Studio workspace", () => {
  it("lists, loads, acts, unregisters, and re-registers through HTTP", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const auth = new AuthServicePlugin({
      storageDir: await createTempDataDir("brains-declarative-studio-auth-"),
    });
    await auth.register(shell);
    authPlugins.push(auth);
    const cookie = (await auth.getService().createAuthSession()).cookie;

    const studio = studioPlugin();
    await studio.register(shell);
    const service = instantiateService();
    await service.register(shell);
    await service.finalizeRegistration?.();

    const typesRoute = findRoute(studio, "/studio/api/types");
    const workspaceRoute = findRoute(studio, "/studio/api/workspace");
    const actionRoute = findRoute(studio, "/studio/api/workspace", "POST");
    const headers = { Cookie: cookie };

    const navigation = await responseJson(
      await typesRoute.handler(
        new Request("https://yeehaa.io/studio/api/types", { headers }),
      ),
    );
    expect(navigation).toMatchObject({
      workspaces: [
        {
          label: "Account",
          rendererName: "StudioAccountWorkspace",
          entityTypes: [],
        },
        {
          label: "Reading library",
          rendererName: "DeclarativeOperatorWorkspace",
          entityTypes: [],
        },
      ],
    });
    if (
      navigation === null ||
      typeof navigation !== "object" ||
      !("workspaces" in navigation) ||
      !Array.isArray(navigation.workspaces)
    ) {
      throw new Error("Expected workspace navigation");
    }
    const descriptor = navigation.workspaces.find(
      (workspace) =>
        typeof workspace === "object" &&
        workspace !== null &&
        "rendererName" in workspace &&
        workspace.rendererName === "DeclarativeOperatorWorkspace",
    );
    if (
      descriptor === null ||
      typeof descriptor !== "object" ||
      !("id" in descriptor) ||
      typeof descriptor.id !== "string"
    ) {
      throw new Error("Expected workspace descriptor id");
    }

    const loaded = await workspaceRoute.handler(
      new Request(
        `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(descriptor.id)}`,
        { headers },
      ),
    );
    expect(loaded.status).toBe(200);
    expect(await responseJson(loaded)).toEqual({
      workspace: {
        id: descriptor.id,
        rendererName: "DeclarativeOperatorWorkspace",
        data: {
          view: {
            title: "Reading library",
            blocks: [
              {
                type: "stats",
                items: [{ label: "Saved", value: 3 }],
              },
              {
                type: "action",
                actionId: "refresh",
                label: "Refresh",
                input: { id: "saved-1" },
              },
            ],
          },
        },
      },
    });

    const acted = await actionRoute.handler(
      new Request("https://yeehaa.io/studio/api/workspace", {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Origin: "https://yeehaa.io",
        },
        body: JSON.stringify({
          id: descriptor.id,
          action: { actionId: "refresh", input: { id: "saved-1" } },
        }),
      }),
    );
    expect(acted.status).toBe(200);
    expect(await responseJson(acted)).toEqual({
      result: { refreshed: "saved-1" },
    });

    await service.shutdown?.();
    servicePlugins.splice(servicePlugins.indexOf(service), 1);
    const removed = await workspaceRoute.handler(
      new Request(
        `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(descriptor.id)}`,
        { headers },
      ),
    );
    expect(removed.status).toBe(404);

    const restarted = instantiateService();
    await restarted.register(shell);
    await restarted.finalizeRegistration?.();
    const restored = await workspaceRoute.handler(
      new Request(
        `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(descriptor.id)}`,
        { headers },
      ),
    );
    expect(restored.status).toBe(200);
  });
});
