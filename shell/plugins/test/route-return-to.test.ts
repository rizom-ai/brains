import { describe, expect, it } from "bun:test";
import type { AuthPrincipal } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { createMockAuthBackend } from "../src/test/mock-auth-backend";
import { MemoryAccountSettingsBackend } from "../src/test/memory-account-settings-backend";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineAccountSettings,
  defineInterface,
  defineRoute,
  defineServicePlugin,
  defineStudioWorkspace,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  protocol,
  studioWorkspaceRegisterContract,
  type Plugin,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  type WebRouteDefinition,
} from "../src";

const CONSENT = "https://provider.example";

const connection = defineAccountSettings({
  title: "Provider",
  schema: z.object({ accessToken: z.string().min(1) }),
  fields: { accessToken: { label: "Access token", secret: true } },
});

const connectionQuery = z.object({
  connection: z.enum(["connected", "declined", "failed"]).optional(),
});

const connect = defineWorkspaceAction({
  name: "connect",
  label: "Connect",
  permission: "trusted",
  input: z.object({}),
  launch: { origins: [CONSENT] },
});

const connections = defineStudioWorkspace({
  id: "connections",
  label: "Connections",
  permission: "trusted",
  query: connectionQuery,
  data: z.object({}),
  actions: [connect],
  view: () => ({ blocks: [] }),
});

/** Another package's workspace: a route may not send the browser there. */
const elsewhere = defineStudioWorkspace({
  id: "elsewhere",
  label: "Elsewhere",
  permission: "trusted",
  query: connectionQuery,
  data: z.object({}),
  actions: [],
  view: () => ({ blocks: [] }),
});

const returnPath = "/provider/return";

const connector = defineServicePlugin(
  { id: "connector", config: z.object({}), accountSettings: connection },
  {
    routes: ({ accountSettings }) => [
      defineRoute({
        method: "GET",
        path: returnPath,
        security: protocol({
          authenticate: ({ request }) =>
            new URL(request.url).searchParams.has("state")
              ? { id: "provider" }
              : null,
        }),
        returnTo: connections,
        async handle({ request }) {
          const params = new URL(request.url).searchParams;
          if (params.get("error")) return { connection: "declined" };
          if (params.get("code") === "garbled") {
            // An answer outside the workspace's query, untyped.
            return JSON.parse(`{"connection":"maybe"}`);
          }
          return accountSettings
            .redeem(params.get("state") ?? "", () => ({
              accessToken: `token-for-${params.get("code") ?? ""}`,
            }))
            .then(
              () => ({ connection: "connected" }),
              () => ({ connection: "failed" }),
            );
        },
      }),
    ],
    studioWorkspaces: (context) => [
      connections.bind(context, {
        load: () => ({}),
        actions: [
          connect.bind(context, async ({ accountSettings }) => ({
            url: `${CONSENT}/consent?state=${encodeURIComponent(await accountSettings.claim())}`,
          })),
        ],
      }),
    ],
  },
);

function principal(userId: string): AuthPrincipal {
  return {
    userId,
    personId: `person-${userId}`,
    displayName: userId,
    role: "admin",
    status: "active",
    permissionLevel: "admin",
    isAnchor: true,
  };
}

const anchor: StudioWorkspaceActor = {
  interfaceType: "studio",
  userId: "usr_anchor",
  actor: { kind: "user", userId: "usr_anchor" },
  userPermissionLevel: "admin",
  visibilityScope: "restricted",
  isAnchor: true,
};

interface Installed {
  readonly shell: MockShell;
  readonly backend: MemoryAccountSettingsBackend;
  readonly service: Plugin;
  readonly workspace: StudioWorkspaceRegistration | undefined;
  readonly route: WebRouteDefinition;
}

async function install(
  definition: Parameters<typeof instantiatePluginPackageDefinition>[0],
  options: { readonly studio?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const workspaces: StudioWorkspaceRegistration[] = [];
  if (options.studio !== false) {
    shell
      .getMessageBus()
      .subscribe<StudioWorkspaceRegistration>(
        studioWorkspaceRegisterContract.name,
        (message) => {
          workspaces.push(message.payload);
          return {
            success: true,
            data: {
              workspaceUrl: `/studio/workspaces/${encodeURIComponent(message.payload.id)}`,
            },
          };
        },
      );
  }
  const backend = new MemoryAccountSettingsBackend();
  shell.getAccountSettingsRegistry().bindBackend(backend);
  shell.getAuthRegistry().bindBackend(
    createMockAuthBackend({
      resolveSession: async (request) => {
        const userId = /session=([^;]+)/u.exec(
          request.headers.get("cookie") ?? "",
        )?.[1];
        return userId ? principal(userId) : undefined;
      },
    }),
  );
  const [service] = instantiatePluginPackageDefinition(
    definition,
    {},
    {
      name: "@fixture/connector",
      version: "0.1.0",
    },
  );
  if (!service) throw new Error("No service plugin");
  await service.register(shell);
  await service.finalizeRegistration?.();
  const [route] = service.getWebRoutes?.() ?? [];
  if (!route) throw new Error("No route was declared");
  return { shell, backend, service, workspace: workspaces[0], route };
}

async function returning(
  installed: Installed,
  query: string,
  userId?: string,
): Promise<Response> {
  return installed.route.handler(
    new Request(`http://brain${returnPath}?${query}`, {
      headers: userId ? { cookie: `session=${userId}` } : {},
    }),
  );
}

async function claimed(installed: Installed): Promise<string> {
  const launched = z
    .object({ url: z.string() })
    .parse(
      await installed.workspace?.actionHandler?.(
        { actionId: "connect", input: {} },
        anchor,
      ),
    );
  return new URL(launched.url).searchParams.get("state") ?? "";
}

describe("a route that returns the browser to its package's workspace", () => {
  it("answers 303 to the workspace with the query its handler returns", async () => {
    const installed = await install(connector);
    const state = await claimed(installed);

    const connected = await returning(
      installed,
      `state=${state}&code=one`,
      "usr_anchor",
    );
    expect(connected.status).toBe(303);
    expect(connected.headers.get("cache-control")).toBe("no-store");
    expect(connected.headers.get("location")).toBe(
      `/studio/workspaces/${encodeURIComponent(installed.workspace?.id ?? "")}?connection=connected`,
    );
    expect(
      (
        await installed.backend.read({
          packageName: "@fixture/connector",
          definitionId: "connector",
          actorId: "usr_anchor",
        })
      )?.values,
    ).toEqual({ accessToken: "token-for-one" });

    // The claim was used; the browser comes back to say so.
    const replayed = await returning(
      installed,
      `state=${state}&code=one`,
      "usr_anchor",
    );
    expect(replayed.headers.get("location")).toEndWith("?connection=failed");
    await installed.service.shutdown?.();
  });

  it("answers an answer its workspace's query refuses as a coded failure, not a redirect", async () => {
    const installed = await install(connector);

    const garbled = await returning(installed, "state=x&code=garbled");
    expect(garbled.status).toBe(500);
    expect(garbled.headers.get("location")).toBeNull();
    expect(await garbled.json()).toEqual({
      error: "Invalid response",
      code: "invalid_response",
    });
    await installed.service.shutdown?.();
  });

  it("answers no_handler while no Studio hosts the workspace", async () => {
    const installed = await install(connector, { studio: false });

    const declined = await returning(installed, "state=x&error=denied");
    expect(declined.status).toBe(503);
    expect(await declined.json()).toMatchObject({ code: "no_handler" });
    await installed.service.shutdown?.();
  });

  it("refuses at registration a workspace the package does not declare", async () => {
    const stray = defineServicePlugin(
      { id: "connector", config: z.object({}) },
      {
        routes: () => [
          defineRoute({
            method: "GET",
            path: returnPath,
            security: { kind: "public" },
            returnTo: elsewhere,
            handle: () => ({ connection: "connected" }),
          }),
        ],
        studioWorkspaces: (context) => [
          connections.bind(context, {
            load: () => ({}),
            actions: [
              connect.bind(context, () => ({ url: `${CONSENT}/consent` })),
            ],
          }),
        ],
      },
    );

    expect(install(stray)).rejects.toThrow(
      'returns to Studio workspace "elsewhere", which this package does not declare',
    );
  });

  it("refuses a workspace with no query, and any method but GET", () => {
    const queryless = defineStudioWorkspace({
      id: "queryless",
      label: "Queryless",
      permission: "trusted",
      data: z.object({}),
      actions: [],
      view: () => ({ blocks: [] }),
    });
    expect(() =>
      defineRoute({
        method: "GET",
        path: returnPath,
        security: { kind: "public" },
        // @ts-expect-error The browser returns with the workspace's query.
        returnTo: queryless,
        handle: () => ({}),
      }),
    ).toThrow("declares no query");
    expect(() =>
      defineRoute({
        // @ts-expect-error Only a GET navigation returns the browser.
        method: "POST",
        path: returnPath,
        security: { kind: "public" },
        // @ts-expect-error Any other route answers JSON, so declares no returnTo.
        returnTo: connections,
        handle: () => ({ connection: "connected" }),
      }),
    ).toThrow("GET");
  });

  it("keeps the literal query a handler returns, and refuses one its schema does not", () => {
    defineRoute({
      method: "GET",
      path: returnPath,
      security: { kind: "public" },
      returnTo: connections,
      handle: () => ({ connection: "declined" }),
    });
    // "maybe" is not a connection the query names, so neither form of
    // defineRoute takes this one; TypeScript reports the last form's refusal.
    defineRoute({
      method: "GET",
      path: returnPath,
      security: { kind: "public" },
      // @ts-expect-error The query refuses "maybe", so this is no return-to route.
      returnTo: connections,
      handle: () => ({ connection: "maybe" }),
    });
    expect(connections.query).toBe(connectionQuery);
  });

  it("refuses an interface's, which declares no workspace to return to", async () => {
    const webhook = defineInterface(
      { id: "provider-webhook", config: z.object({}) },
      {
        routes: () => [
          defineRoute({
            method: "GET",
            path: returnPath,
            security: { kind: "public" },
            returnTo: connections,
            handle: () => ({ connection: "connected" }),
          }),
        ],
      },
    );
    const [plugin] = instantiatePluginPackageDefinition(
      webhook,
      {},
      {
        name: "@fixture/provider-webhook",
        version: "0.1.0",
      },
    );
    if (!plugin) throw new Error("No interface plugin");

    expect(plugin.register(createMockShell())).rejects.toThrow(
      'returns to Studio workspace "connections", which only a service that declares it can do',
    );
  });
});
