import { describe, expect, it } from "bun:test";
import {
  dashboardWidgetRegisterContract,
  dashboardWidgetUnregisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import { createDashboardPlugins } from "./dashboard-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
}

/** One brain process with the dashboard installed. */
async function installed(
  options: { executionOnly?: boolean; routePath?: string } = {},
): Promise<Installed> {
  const shell = createMockShell({ domain: "brain.test" });
  const plugins = createDashboardPlugins(
    options.routePath ? { routePath: options.routePath } : {},
  );
  const capabilities = await registerAll(shell, plugins, options);
  return { shell, plugins, capabilities };
}

/**
 * What Dashboard registers, pinned as its service class registered it: its
 * page, console jump and asset routes, its endpoint and way in, and its
 * answers to the widget contracts.
 */
describe("the Dashboard package's registered surface", () => {
  it("is the dashboard service, with no tools, its page, jump and asset routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([["dashboard", "service", "@brains/dashboard", []]]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    const routes = plugins.flatMap((plugin) => plugin.getWebRoutes?.() ?? []);
    expect(
      routes.map(
        ({ method, path, match, role, public: open }) =>
          `${method ?? "GET"} ${path.replace(/\.[a-f0-9]{64}\./, ".<hash>.")} ${match ?? "exact"} ${role ?? "-"} ${open === true ? "public" : "-"}`,
      ),
    ).toEqual([
      "GET /dashboard exact dashboard public",
      "GET /api/console/jump exact - public",
      "GET /dashboard/assets/dashboard.<hash>.css exact - public",
      "GET /dashboard/assets/dashboard.<hash>.js exact - public",
      "GET /dashboard/assets/theme.<hash>.css exact - public",
    ]);
    for (const plugin of plugins)
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
  });

  it("follows its route path", async () => {
    const { plugins, shell } = await installed({ routePath: "/home" });
    const paths = plugins
      .flatMap((plugin) => plugin.getWebRoutes?.() ?? [])
      .map(({ path }) => path);
    expect(paths[0]).toBe("/home");
    expect(
      paths.slice(2).every((path) => path.startsWith("/home/assets/")),
    ).toBe(true);
    expect(shell.listEndpoints().map(({ label, url }) => [label, url])).toEqual(
      [["Dashboard", "/home"]],
    );
  });

  it("offers Dashboard as an endpoint and a way in", async () => {
    const { shell } = await installed();
    expect(
      shell
        .listEndpoints()
        .map(({ label, url, visibility, pluginId }) => [
          label,
          url,
          visibility,
          pluginId,
        ]),
    ).toEqual([["Dashboard", "/dashboard", "public", "dashboard"]]);
    expect(
      (await shell.getAppInfo()).interactions
        .filter(({ pluginId }) => pluginId === "dashboard")
        .map(({ id, href, kind, visibility }) => [id, href, kind, visibility]),
    ).toEqual([["dashboard", "/dashboard", "human", "public"]]);
  });

  it("answers the widget contracts in the main process only", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({ executionOnly });
      const bus = shell.getMessageBus();
      expect({
        executionOnly,
        register: bus.getHandlerCount(dashboardWidgetRegisterContract.name),
        unregister: bus.getHandlerCount(dashboardWidgetUnregisterContract.name),
      }).toEqual({
        executionOnly,
        register: executionOnly ? 0 : 1,
        unregister: executionOnly ? 0 : 1,
      });
    }
  });
});
