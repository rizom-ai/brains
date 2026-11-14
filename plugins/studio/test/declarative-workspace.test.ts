import { authServiceOf, authServicePlugin } from "@brains/auth-service";
import { createMockShell, createTempDataDir } from "@brains/plugins/test";
import {
  defineStudioWorkspace,
  defineServicePlugin,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";

import { SdkError } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { afterEach, describe, expect, it } from "bun:test";
import { studioPlugin, type StudioPlugin } from "./studio-plugins";

const authPlugins: Plugin[] = [];
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

const definition = defineServicePlugin(
  {
    id: "reading-operator",
    config: z.object({}),
    setup: () => ({ count: 3 }),
  },
  {
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
  },
);

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
    const auth = authServicePlugin({
      storageDir: await createTempDataDir("brains-declarative-studio-auth-"),
    });
    await auth.register(shell);
    authPlugins.push(auth);
    const cookie = (
      await authServiceOf(shell.getAuthRegistry()).createAuthSession()
    ).cookie;

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
          label: "Overview",
          rendererName: "DeclarativeOperatorWorkspace",
          entityTypes: [],
          badge: 0,
        },
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
        "label" in workspace &&
        workspace.label === "Reading library",
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

const SECRET = "Snapshots unreadable at /srv/brain/private";

const reserve = defineWorkspaceAction({
  name: "reserve",
  label: "Reserve",
  permission: "trusted",
  input: z.object({ seats: z.number().int().positive() }),
  output: z.object({ reserved: z.number() }),
});

const broken = defineStudioWorkspace({
  id: "broken",
  label: "Broken",
  permission: "trusted",
  data: z.object({ count: z.number() }),
  actions: [reserve],
  view: ({ data }) => ({
    blocks: [{ type: "stats", items: [{ label: "Saved", value: data.count }] }],
  }),
});

const failingDefinition = defineServicePlugin(
  {
    id: "failing-operator",
    config: z.object({}),
    setup: () => ({}),
  },
  {
    studioWorkspaces: (context) => [
      broken.bind(context, {
        actions: [
          reserve.bind(context, () => {
            throw new SdkError("conflict", {
              message: SECRET,
              publicMessage: "Those seats were just taken",
            });
          }),
        ],
        load: () => {
          throw new Error(SECRET);
        },
      }),
    ],
  },
);

describe("a workspace whose data or action fails", () => {
  // A proxy in front of the brain (Cloudflare) replaces an origin 502 with
  // its own HTML page, so a failure is never answered as a gateway error.
  it("answers in public form with the status its code names, never the diagnostic", async () => {
    const shell = createMockShell({ domain: "yeehaa.io" });
    const auth = authServicePlugin({
      storageDir: await createTempDataDir("brains-failing-studio-auth-"),
    });
    await auth.register(shell);
    authPlugins.push(auth);
    const cookie = (
      await authServiceOf(shell.getAuthRegistry()).createAuthSession()
    ).cookie;
    const studio = studioPlugin();
    await studio.register(shell);
    const [service] = instantiatePluginPackageDefinition(
      failingDefinition,
      {},
      { name: "@fixture/failing-operator", version: "0.1.0" },
    );
    if (!service) throw new Error("Service plugin was not created");
    servicePlugins.push(service);
    await service.register(shell);
    await service.finalizeRegistration?.();

    const headers = { Cookie: cookie };
    const navigation = z
      .object({
        workspaces: z.array(z.object({ id: z.string(), label: z.string() })),
      })
      .parse(
        await responseJson(
          await findRoute(studio, "/studio/api/types").handler(
            new Request("https://yeehaa.io/studio/api/types", { headers }),
          ),
        ),
      );
    const id = navigation.workspaces.find((w) => w.label === "Broken")?.id;
    if (!id) throw new Error("Expected the Broken workspace");

    const response = await findRoute(studio, "/studio/api/workspace").handler(
      new Request(
        `https://yeehaa.io/studio/api/workspace?id=${encodeURIComponent(id)}`,
        { headers },
      ),
    );

    expect(response.status).toBe(500);
    expect(await responseJson(response)).toEqual({
      error: "The operation failed",
      code: "handler_failed",
    });

    const act = async (action: object): Promise<Response> =>
      findRoute(studio, "/studio/api/workspace", "POST").handler(
        new Request("https://yeehaa.io/studio/api/workspace", {
          method: "POST",
          headers: {
            ...headers,
            "Content-Type": "application/json",
            Origin: "https://yeehaa.io",
          },
          body: JSON.stringify({ id, action }),
        }),
      );
    const refused = await act({ actionId: "reserve", input: { seats: 2 } });
    expect(refused.status).toBe(409);
    expect(await responseJson(refused)).toEqual({
      error: "Those seats were just taken",
      code: "conflict",
    });
    const invalid = await act({ actionId: "reserve", input: { seats: -1 } });
    expect(invalid.status).toBe(400);
    expect(await responseJson(invalid)).toEqual({
      error: expect.stringContaining("seats"),
      code: "invalid_input",
    });
  });
});
