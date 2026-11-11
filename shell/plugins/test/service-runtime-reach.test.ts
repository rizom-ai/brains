import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { createMockShell, type MockShell } from "../src/test/mock-shell";
import {
  defineServicePlugin,
  defineStudioWorkspace,
  instantiatePluginPackageDefinition,
  serviceRuntime,
  type Plugin,
  type RegisteredWebRoute,
  type ServiceRuntime,
} from "../src";

/**
 * A first-party service that points people at what it serves, as the
 * unified inbox points them at its workspace: a recurring check under the
 * plugin's id, in every process, taken off when it shuts down; a way in, never from a worker; the URL
 * Studio serves one of its workspaces at; the brain's site URL; and the
 * route another plugin mounts for a well-known role.
 */

const inbox = defineStudioWorkspace({
  id: "inbox",
  label: "Inbox",
  permission: "admin",
  data: z.object({}),
  actions: [],
  view: () => ({ blocks: [] }),
});

interface Reached {
  runtime: ServiceRuntime;
  plugin: Plugin;
  /** What the ready handler saw: the workspace's URL, once Studio took it. */
  readyUrl: string | undefined;
}

async function install(
  shell: MockShell,
  executionOnly = false,
): Promise<Reached> {
  let runtime: ServiceRuntime | undefined;
  let readyUrl: string | undefined;
  const [plugin] = instantiatePluginPackageDefinition(
    defineServicePlugin(
      { id: "probe", config: z.object({}) },
      {
        subscriptions: (context) => {
          const reached = serviceRuntime(context);
          runtime = reached;
          reached.recurringCheck({
            id: "daily-digest",
            cadence: "daily",
            includeInInbox: false,
            run: async () => ({ alerts: [] }),
          });
          reached.ready(() => {
            readyUrl = reached.workspaceUrl(inbox);
            reached.interaction({
              id: "probe",
              label: "Probe",
              href: readyUrl ?? "/nowhere",
              kind: "admin",
              priority: 20,
              visibility: "admin",
            });
          });
          return [];
        },
        studioWorkspaces: (context) => [
          inbox.bind(context, { load: () => ({}), actions: [] }),
        ],
      },
    ),
    {},
    { name: "@brains/probe", version: "0.1.0" },
    { pluginId: "probe" },
  );
  if (!plugin) throw new Error("No plugin");
  await plugin.register(shell, { executionOnly });
  await plugin.finalizeRegistration?.();
  await plugin.ready?.();
  if (!runtime) throw new Error("No runtime");
  return { runtime, plugin, readyUrl };
}

function withStudio(shell: MockShell): MockShell {
  shell.getMessageBus().subscribe("studio:register-workspace", (message) => ({
    success: true,
    data: {
      workspaceUrl: `/studio/workspaces/${encodeURIComponent(String(Reflect.get(Object(message.payload), "id")))}`,
    },
  }));
  return shell;
}

describe("a first-party service pointing at what it serves", () => {
  it("registers its recurring check under the plugin's id", async () => {
    const shell = createMockShell();
    await install(shell);
    expect(shell.getRecurringCheck("probe:daily-digest")).toMatchObject({
      id: "daily-digest",
      cadence: "daily",
      includeInInbox: false,
    });
  });

  it("takes its recurring check off when it shuts down, so it registers again in the same process", async () => {
    const shell = createMockShell();
    const { plugin } = await install(shell);
    await plugin.shutdown?.();
    expect(shell.getRecurringCheck("probe:daily-digest")).toBeUndefined();

    // Registered again, as a restarted plugin registers it.
    await install(shell);
    expect(shell.getRecurringCheck("probe:daily-digest")).toMatchObject({
      id: "daily-digest",
      cadence: "daily",
    });
  });

  it("registers its recurring check in a worker too", async () => {
    const shell = createMockShell();
    await install(shell, true);
    expect(shell.getRecurringCheck("probe:daily-digest")).toBeDefined();
  });

  it("knows the URL Studio serves its workspace at, and offers a way in", async () => {
    const shell = withStudio(createMockShell());
    const { readyUrl } = await install(shell);
    expect(readyUrl).toBe("/studio/workspaces/probe%3Ainbox");
    expect(
      (await shell.getAppInfo()).interactions.filter(
        ({ pluginId }) => pluginId === "probe",
      ),
    ).toEqual([
      {
        id: "probe",
        label: "Probe",
        href: "/studio/workspaces/probe%3Ainbox",
        kind: "admin",
        pluginId: "probe",
        priority: 20,
        visibility: "admin",
        status: "available",
      },
    ]);
  });

  it("knows no URL without a Studio", async () => {
    const { readyUrl } = await install(createMockShell());
    expect(readyUrl).toBeUndefined();
  });

  it("offers no way in from a worker", async () => {
    const shell = withStudio(createMockShell());
    await install(shell, true);
    expect(
      (await shell.getAppInfo()).interactions.filter(
        ({ pluginId }) => pluginId === "probe",
      ),
    ).toEqual([]);
  });

  it("reads the brain's site URL and the route a role names", async () => {
    const shell = createMockShell({ domain: "brain.test" });
    const dashboard: RegisteredWebRoute = {
      pluginId: "dashboard",
      fullPath: "/dashboard",
      definition: {
        path: "/dashboard",
        method: "GET",
        role: "dashboard",
        handler: () => new Response("ok"),
      },
    };
    shell.getPluginWebRoutes = (): RegisteredWebRoute[] => [dashboard];
    const { runtime } = await install(shell);
    expect(runtime.siteUrl).toBe("https://brain.test");
    expect(runtime.routeByRole("dashboard")?.fullPath).toBe("/dashboard");
    expect(runtime.routeByRole("studio-workspaces")).toBeUndefined();
  });

  it("has no site URL when the brain names no domain", async () => {
    const { runtime } = await install(createMockShell());
    expect(runtime.siteUrl).toBeUndefined();
  });
});
