import { describe, expect, it } from "bun:test";
import { inspect } from "node:util";
import type { AuthPrincipal } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { createMockAuthBackend } from "../src/test/mock-auth-backend";
import { MemoryAccountSettingsBackend } from "../src/test/memory-account-settings-backend";
import { createMockShell } from "../src/test/mock-shell";
import {
  defineAccountSettings,
  defineRoute,
  defineServicePlugin,
  defineStudioWorkspace,
  defineTool,
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
const MARKER = "[secret]";

const connection = defineAccountSettings({
  title: "Reader import",
  schema: z.object({
    accessToken: z.string().min(8),
    feedUrl: z.url(),
  }),
  fields: {
    accessToken: { label: "Access token", secret: true },
    feedUrl: { label: "Feed URL", control: "url" },
  },
});

const library = defineStudioWorkspace({
  id: "library",
  label: "Library",
  permission: "trusted",
  data: z.object({ note: z.string() }),
  actions: [],
  view: ({ data }) => ({
    blocks: [
      { type: "key-values", items: [{ label: "Note", value: data.note }] },
    ],
  }),
});

const reader = defineServicePlugin(
  { id: "reader", config: z.object({}), accountSettings: connection },
  {
    tools: ({ accountSettings }) => [
      defineTool({
        name: "save",
        description: "Keep the caller's own connection",
        input: z.object({ accessToken: z.string() }),
        output: z.object({}),
        permission: "public",
        async execute({ input }) {
          await accountSettings.save({
            accessToken: input.accessToken,
            feedUrl: "https://provider.example/feed",
          });
          return {};
        },
      }),
      defineTool({
        name: "peek",
        description: "Read the caller's connection",
        input: z.object({}),
        output: z.object({
          settings: z.unknown(),
          revealed: z.string().nullable(),
        }),
        permission: "public",
        async execute() {
          const settings = await accountSettings.read();
          return {
            // Handed back whole: the secret leaves as its marker.
            settings,
            revealed: settings?.accessToken.reveal() ?? null,
          };
        },
      }),
      defineTool({
        name: "refuse",
        description: "Fail with the caller's connection in the message",
        input: z.object({}),
        output: z.object({}),
        permission: "public",
        async execute() {
          const settings = await accountSettings.read();
          throw new Error(`Provider refused ${settings?.accessToken}`);
        },
      }),
    ],
    routes: ({ accountSettings }) => [
      defineRoute({
        method: "GET",
        path: "/reader/settings",
        security: { kind: "public" },
        response: z.object({ settings: z.unknown() }),
        handle: async () => ({ settings: await accountSettings.read() }),
      }),
    ],
    studioWorkspaces: (context) => [
      library.bind(context, {
        actions: [],
        async load({ accountSettings }) {
          const settings = await accountSettings.read();
          return { note: `Connected with ${settings?.accessToken}` };
        },
      }),
    ],
  },
);

const toolCaller = (userId: string): ToolContext => ({
  interfaceType: "mcp",
  actor: { kind: "user", userId },
  userPermissionLevel: "admin",
});
const agent: ToolContext = {
  interfaceType: "a2a",
  actor: { kind: "service", serviceId: "peer" },
  userPermissionLevel: "admin",
};

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

interface Installed {
  readonly capabilities: PluginCapabilities;
  readonly routes: WebRouteDefinition[];
  readonly workspace: StudioWorkspaceRegistration;
  readonly logged: () => string;
  readonly plugin: Plugin;
}

async function install(): Promise<Installed> {
  const lines: unknown[] = [];
  const record = (...args: unknown[]): void => {
    lines.push(args);
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
        return { success: true, data: { workspaceUrl: "/studio/library" } };
      },
    );
  shell
    .getAccountSettingsRegistry()
    .bindBackend(new MemoryAccountSettingsBackend());
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
  const [plugin] = instantiatePluginPackageDefinition(
    reader,
    {},
    {
      name: "@fixture/reader",
      version: "0.1.0",
    },
  );
  if (!plugin) throw new Error("No service plugin");
  const capabilities = await plugin.register(shell);
  await plugin.finalizeRegistration?.();
  const [workspace] = workspaces;
  if (!workspace) throw new Error("No Studio workspace was registered");
  return {
    capabilities,
    routes: plugin.getWebRoutes?.() ?? [],
    workspace,
    plugin,
    logged: () => JSON.stringify(lines),
  };
}

async function call(
  installed: Installed,
  name: string,
  caller: ToolContext,
  input: object = {},
): Promise<unknown> {
  const tool = installed.capabilities.tools.find(
    (candidate) => candidate.name === `reader_${name}`,
  );
  if (!tool) throw new Error(`No tool ${name}`);
  return tool.handler(input, caller);
}

function studio(userId: string): StudioWorkspaceActor {
  return {
    interfaceType: "studio",
    userId,
    actor: { kind: "user", userId },
    userPermissionLevel: "admin",
    visibilityScope: "restricted",
    isAnchor: true,
  };
}

describe("reading a package's own account settings", () => {
  it("hands the caller's own settings back, a secret only when revealed", async () => {
    const installed = await install();
    await call(installed, "save", toolCaller("usr_reader"), {
      accessToken: SECRET,
    });

    const answered = await call(installed, "peek", toolCaller("usr_reader"));
    // Printed for a log or an inspector, the secret is its marker.
    expect(inspect(answered).split(SECRET)).toHaveLength(2);
    expect(inspect(answered)).toContain(MARKER);
    // As the tool's caller receives it, serialized.
    const peeked: unknown = JSON.parse(JSON.stringify(answered));
    expect(peeked).toMatchObject({
      success: true,
      data: {
        settings: {
          accessToken: MARKER,
          feedUrl: "https://provider.example/feed",
        },
        revealed: SECRET,
      },
    });
    // The whole result, as the tool's caller receives it, holds the secret
    // only where the package revealed it on purpose.
    expect(JSON.stringify(peeked).split(SECRET)).toHaveLength(2);
    await installed.plugin.shutdown?.();
  });

  it("serializes a secret as its marker in a route answer, a view and a log line", async () => {
    const installed = await install();
    await call(installed, "save", toolCaller("usr_anchor"), {
      accessToken: SECRET,
    });

    const route = installed.routes.find(
      (candidate) => candidate.path === "/reader/settings",
    );
    if (!route) throw new Error("No settings route");
    const answered = await route.handler(
      new Request("http://brain/reader/settings", {
        headers: { cookie: "session=usr_anchor" },
      }),
    );
    expect(await answered.json()).toEqual({
      settings: {
        accessToken: MARKER,
        feedUrl: "https://provider.example/feed",
      },
    });

    const view = await installed.workspace.dataProvider(
      studio("usr_anchor"),
      {},
    );
    expect(JSON.stringify(view)).toContain(`Connected with ${MARKER}`);
    expect(JSON.stringify(view)).not.toContain(SECRET);

    expect(
      await call(installed, "refuse", toolCaller("usr_anchor")),
    ).toMatchObject({ success: false, code: "handler_failed" });
    expect(installed.logged()).toContain(`Provider refused ${MARKER}`);
    expect(installed.logged()).not.toContain(SECRET);
    await installed.plugin.shutdown?.();
  });

  it("reads nothing for a caller without an account, nor another account's", async () => {
    const installed = await install();
    await call(installed, "save", toolCaller("usr_reader"), {
      accessToken: SECRET,
    });

    for (const caller of [agent, toolCaller("usr_other")]) {
      expect(await call(installed, "peek", caller)).toMatchObject({
        success: true,
        data: { settings: null, revealed: null },
      });
    }
    const view = await installed.workspace.dataProvider(
      studio("usr_other"),
      {},
    );
    expect(JSON.stringify(view)).toContain("Connected with undefined");
    await installed.plugin.shutdown?.();
  });

  it("types a secret so a string is had only by revealing it", () => {
    defineServicePlugin(
      { id: "reader", config: z.object({}), accountSettings: connection },
      {
        tools: ({ accountSettings }) => [
          defineTool({
            name: "use",
            description: "Use the caller's connection",
            input: z.object({}),
            output: z.object({}),
            async execute() {
              const settings = await accountSettings.read();
              if (!settings) return {};
              const feed: string = settings.feedUrl;
              const token: string = settings.accessToken.reveal();
              // @ts-expect-error A secret is not a string until it is revealed.
              const leaked: string = settings.accessToken;
              void [feed, token, leaked];
              return {};
            },
          }),
        ],
      },
    );
    defineServicePlugin(
      { id: "unset", config: z.object({}) },
      {
        tools: ({ accountSettings }) => [
          defineTool({
            name: "use",
            description: "Refused: the package declares no settings",
            input: z.object({}),
            output: z.object({}),
            async execute() {
              // @ts-expect-error The header declares no account settings.
              await accountSettings.read();
              return {};
            },
          }),
        ],
      },
    );
    expect(connection.fields.accessToken.secret).toBe(true);
  });
});
