import { describe, expect, it, mock } from "bun:test";
import type { AuthPrincipal } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { createMockAuthBackend } from "../src/test/mock-auth-backend";
import { MemoryAccountSettingsBackend } from "../src/test/memory-account-settings-backend";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineAccountSettings,
  defineRoute,
  defineServicePlugin,
  defineStudioWorkspace,
  defineTool,
  defineWorkspaceAction,
  instantiatePluginPackageDefinition,
  studioWorkspaceRegisterContract,
  type Plugin,
  type PluginCapabilities,
  type StudioWorkspaceActor,
  type StudioWorkspaceRegistration,
  type ToolContext,
  type WebRouteDefinition,
} from "../src";

const SECRET = "tok-very-secret-value";

const connection = defineAccountSettings({
  title: "Reader import",
  schema: z.object({
    accessToken: z.string().min(8),
    expiresAt: z.iso.datetime().optional(),
  }),
  fields: {
    accessToken: { label: "Access token", secret: true },
    expiresAt: { label: "Expires" },
  },
});

const reader: ToolContext = {
  interfaceType: "mcp",
  actor: { kind: "user", userId: "usr_reader" },
  userPermissionLevel: "admin",
};
const agent: ToolContext = {
  interfaceType: "a2a",
  actor: { kind: "service", serviceId: "peer" },
  userPermissionLevel: "admin",
};

/** A browser session cookie names the account it belongs to. */
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

function sessionRequest(path: string, userId?: string): Request {
  return new Request(`http://brain${path}`, {
    headers: userId ? { cookie: `session=${userId}` } : {},
  });
}

const exchanged = mock(async (code: string) => ({
  accessToken: `${SECRET}-${code}`,
}));

const CONSENT = "https://provider.example";

// Studio's way to connect: an action that sends the browser to consent.
const connectProvider = defineWorkspaceAction({
  name: "connect",
  label: "Connect",
  permission: "trusted",
  input: z.object({}),
  launch: { origins: [CONSENT] },
});
const connectionWorkspace = defineStudioWorkspace({
  id: "connection",
  label: "Connection",
  permission: "trusted",
  data: z.object({}),
  actions: [connectProvider],
  view: () => ({ blocks: [] }),
});

const importer = defineServicePlugin(
  { id: "reader-import", config: z.object({}), accountSettings: connection },
  {
    tools: ({ accountSettings }) => [
      defineTool({
        name: "paste-token",
        description: "Keep the caller's own token",
        input: z.object({ accessToken: z.string() }),
        output: z.object({}),
        permission: "public",
        async execute({ input }) {
          await accountSettings.save({ accessToken: input.accessToken });
          return {};
        },
      }),
      defineTool({
        name: "connect",
        description: "Start a connection for the caller's account",
        input: z.object({}),
        output: z.object({ state: z.string() }),
        permission: "public",
        execute: async () => ({ state: await accountSettings.claim() }),
      }),
    ],
    routes: ({ accountSettings }) => [
      defineRoute({
        method: "GET",
        path: "/reader-import/connect",
        security: { kind: "public" },
        response: z.object({ state: z.string() }),
        handle: async () => ({ state: await accountSettings.claim() }),
      }),
      defineRoute({
        method: "GET",
        path: "/reader-import/callback",
        security: { kind: "public" },
        response: z.object({ connected: z.boolean() }),
        async handle({ request }) {
          const params = new URL(request.url).searchParams;
          const code = params.get("code") ?? "";
          await accountSettings.redeem(params.get("state") ?? "", () =>
            exchanged(code),
          );
          return { connected: true };
        },
      }),
    ],
    studioWorkspaces: (context) => [
      connectionWorkspace.bind(context, {
        load: () => ({}),
        actions: [
          connectProvider.bind(context, async ({ accountSettings }) => ({
            url: `${CONSENT}/consent?state=${encodeURIComponent(await accountSettings.claim())}`,
          })),
        ],
      }),
    ],
  },
);

interface Installed {
  readonly shell: MockShell;
  readonly backend: MemoryAccountSettingsBackend;
  readonly logged: unknown[];
  readonly capabilities: PluginCapabilities;
  readonly routes: WebRouteDefinition[];
  readonly workspace: StudioWorkspaceRegistration;
}

async function install(): Promise<Installed> {
  const logged: unknown[] = [];
  // One logger for the shell and every plugin it hands a child to.
  const record = (...args: unknown[]): void => {
    logged.push(args);
  };
  const logger: Logger = {
    silly: record,
    verbose: record,
    debug: record,
    info: record,
    warn: record,
    error: record,
    child: (): Logger => logger,
    setUseStderr: (): void => {},
  };
  const shell = createMockShell({ logger });
  const workspaces: StudioWorkspaceRegistration[] = [];
  shell
    .getMessageBus()
    .subscribe<StudioWorkspaceRegistration>(
      studioWorkspaceRegisterContract.name,
      (message) => {
        workspaces.push(message.payload);
        return { success: true, data: { workspaceUrl: "/studio/connection" } };
      },
    );
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
  const plugins = instantiatePluginPackageDefinition(
    importer,
    {},
    { name: "@fixture/reader-import", version: "0.1.0" },
  );
  const registered = await plugins.reduce<
    Promise<{ plugin: Plugin; capabilities: PluginCapabilities }[]>
  >(
    async (done, plugin) => [
      ...(await done),
      { plugin, capabilities: await plugin.register(shell) },
    ],
    Promise.resolve([]),
  );
  const service = registered.find(({ plugin }) => plugin.type === "service");
  if (!service) throw new Error("No service plugin");
  await service.plugin.finalizeRegistration?.();
  const [workspace] = workspaces;
  if (!workspace) throw new Error("No Studio workspace was registered");
  return {
    shell,
    backend,
    logged,
    capabilities: service.capabilities,
    routes: service.plugin.getWebRoutes?.() ?? [],
    workspace,
  };
}

async function call(
  installed: Installed,
  name: string,
  input: object,
  caller: ToolContext = reader,
): Promise<unknown> {
  const tool = installed.capabilities.tools.find(
    (candidate) => candidate.name === `reader-import_${name}`,
  );
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.handler(input, caller);
}

async function visit(
  installed: Installed,
  path: string,
  userId?: string,
): Promise<{ status: number; body: unknown }> {
  const route = installed.routes.find(
    (candidate) => candidate.path === new URL(`http://brain${path}`).pathname,
  );
  if (!route) throw new Error(`No route ${path}`);
  const response = await route.handler(sessionRequest(path, userId));
  return { status: response.status, body: await response.json() };
}

async function stored(installed: Installed, userId: string): Promise<unknown> {
  return (
    await installed.backend.read({
      packageName: "@fixture/reader-import",
      definitionId: "reader-import",
      actorId: userId,
    })
  )?.values;
}

const stateOf = (body: unknown): string =>
  z.object({ state: z.string() }).parse(body).state;
const toolStateOf = (response: unknown): string =>
  z.object({ data: z.object({ state: z.string() }) }).parse(response).data
    .state;

describe("a service's account settings writes", () => {
  it("save the caller's own account, through the package's own definition", async () => {
    const installed = await install();

    expect(
      await call(installed, "paste-token", { accessToken: SECRET }),
    ).toEqual({ success: true, data: {} });
    expect(await stored(installed, "usr_reader")).toEqual({
      accessToken: SECRET,
    });
  });

  it("refuse a caller with no account", async () => {
    const installed = await install();

    expect(
      await call(installed, "paste-token", { accessToken: SECRET }, agent),
    ).toMatchObject({ success: false, code: "permission_denied" });
  });

  it("name only the offending field of a refused value, never the value", async () => {
    const installed = await install();
    const short = "tok-1";

    const refused = await call(installed, "paste-token", {
      accessToken: short,
    });
    expect(refused).toMatchObject({
      success: false,
      code: "invalid_input",
      error: expect.stringContaining("accessToken"),
    });
    expect(JSON.stringify(refused)).not.toContain(short);
    expect(JSON.stringify(installed.logged)).not.toContain(short);
  });

  it("redeem a claim made without a session for the account that made it", async () => {
    const installed = await install();
    const state = toolStateOf(await call(installed, "connect", {}));

    expect(
      await visit(installed, `/reader-import/callback?state=${state}&code=one`),
    ).toEqual({ status: 200, body: { connected: true } });
    expect(await stored(installed, "usr_reader")).toEqual({
      accessToken: `${SECRET}-one`,
    });
    expect(JSON.stringify(installed.logged)).not.toContain(SECRET);
  });

  it("redeem a session-bound claim only from the session's own account", async () => {
    const installed = await install();
    const state = stateOf(
      (await visit(installed, "/reader-import/connect", "usr_anchor")).body,
    );
    const callback = `/reader-import/callback?state=${state}&code=two`;
    exchanged.mockClear();

    for (const other of [undefined, "usr_intruder"]) {
      expect(await visit(installed, callback, other)).toEqual({
        status: 403,
        body: { error: expect.any(String), code: "permission_denied" },
      });
    }
    // Refused before any exchange, and without burning the claim.
    expect(exchanged).not.toHaveBeenCalled();
    expect(await stored(installed, "usr_intruder")).toBeUndefined();

    expect(await visit(installed, callback, "usr_anchor")).toEqual({
      status: 200,
      body: { connected: true },
    });
    expect(await stored(installed, "usr_anchor")).toEqual({
      accessToken: `${SECRET}-two`,
    });
  });

  it("claim from a workspace action for the operator and their Studio session", async () => {
    const installed = await install();
    const operator: StudioWorkspaceActor = {
      interfaceType: "studio",
      userId: "usr_anchor",
      actor: { kind: "user", userId: "usr_anchor" },
      userPermissionLevel: "admin",
      visibilityScope: "restricted",
      isAnchor: true,
    };
    const launched = z
      .object({ kind: z.literal("launch"), url: z.string() })
      .parse(
        await installed.workspace.actionHandler?.(
          { actionId: "connect", input: {} },
          operator,
        ),
      );
    const consent = new URL(launched.url);
    expect(consent.origin).toBe(CONSENT);
    const state = consent.searchParams.get("state") ?? "";
    const callback = `/reader-import/callback?state=${state}&code=three`;
    exchanged.mockClear();

    // Only the operator's own session brings the claim back.
    for (const other of [undefined, "usr_intruder"]) {
      expect(await visit(installed, callback, other)).toMatchObject({
        status: 403,
        body: { code: "permission_denied" },
      });
    }
    expect(exchanged).not.toHaveBeenCalled();
    expect(await visit(installed, callback, "usr_anchor")).toEqual({
      status: 200,
      body: { connected: true },
    });
    expect(await stored(installed, "usr_anchor")).toEqual({
      accessToken: `${SECRET}-three`,
    });
  });

  it("claim nothing for a route visitor without a session", async () => {
    const installed = await install();

    expect(await visit(installed, "/reader-import/connect")).toEqual({
      status: 403,
      body: {
        error: "Account settings need a signed-in account",
        code: "permission_denied",
      },
    });
  });

  it("refuse an unknown, used or failed claim before exchanging anything", async () => {
    const installed = await install();
    exchanged.mockClear();

    expect(
      await visit(installed, "/reader-import/callback?state=forged&code=x"),
    ).toMatchObject({ status: 403, body: { code: "permission_denied" } });
    expect(exchanged).not.toHaveBeenCalled();

    const state = toolStateOf(await call(installed, "connect", {}));
    exchanged.mockImplementationOnce(async () => {
      throw new Error("provider refused the code");
    });
    expect(
      await visit(installed, `/reader-import/callback?state=${state}&code=x`),
    ).toMatchObject({ status: 500, body: { code: "handler_failed" } });
    // The diagnostic is the package's to read, in its own log.
    expect(JSON.stringify(installed.logged)).toContain(
      "provider refused the code",
    );
    expect(await stored(installed, "usr_reader")).toBeUndefined();
    // A failed exchange still used the claim; the caller starts again.
    expect(
      await visit(installed, `/reader-import/callback?state=${state}&code=x`),
    ).toMatchObject({ status: 403, body: { code: "permission_denied" } });
  });

  it("are offered only to slots with a caller, and only when the header declares settings", () => {
    defineServicePlugin(
      {
        id: "reader-import",
        config: z.object({}),
        accountSettings: connection,
      },
      {
        // @ts-expect-error An answer has no caller whose account to write.
        subscriptions: ({ accountSettings }) => {
          void accountSettings;
          return [];
        },
        // @ts-expect-error A job's slot is given no account settings writes.
        jobs: ({ accountSettings }) => {
          void accountSettings;
          return [];
        },
      },
    );
    const undeclared = defineServicePlugin(
      { id: "reader-import", config: z.object({}) },
      {
        tools: ({ accountSettings }) => [
          defineTool({
            name: "claim",
            description: "Refused: the package declares no settings",
            input: z.object({}),
            output: z.object({}),
            async execute() {
              // @ts-expect-error The header declares no account settings.
              await accountSettings.claim();
              // @ts-expect-error The header declares no account settings.
              await accountSettings.save({ accessToken: SECRET });
              return {};
            },
          }),
        ],
      },
    );
    expect(undeclared.family).toBe("service");
  });
});
