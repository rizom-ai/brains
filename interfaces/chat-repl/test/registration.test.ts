import { afterEach, describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { createCliPlugin } from "./cli-plugin";

/**
 * What the CLI registers, pinned as its class registered it: the terminal
 * daemon the app starts by name, and nothing else a brain lists or routes.
 */
describe("the CLI's registered surface", () => {
  const harness = createPluginHarness();

  afterEach(async () => {
    await harness.reset();
  });

  it("registers one interface plugin, cli, with no tools, resources or routes", async () => {
    const plugin = createCliPlugin();
    const capabilities = await harness.installPlugin(plugin);

    expect([plugin.id, plugin.type, plugin.packageName]).toEqual([
      "cli",
      "interface",
      "@brains/chat-repl",
    ]);
    expect(capabilities.tools).toEqual([]);
    expect(capabilities.resources).toEqual([]);
    expect(
      "getWebRoutes" in plugin && typeof plugin.getWebRoutes === "function"
        ? plugin.getWebRoutes()
        : [],
    ).toEqual([]);
    expect(
      "requiresDaemonStartup" in plugin &&
        typeof plugin.requiresDaemonStartup === "function"
        ? plugin.requiresDaemonStartup()
        : false,
    ).toBe(false);
  });

  it("registers its terminal daemon as cli:cli, not running until started", async () => {
    const plugin = createCliPlugin();
    await harness.installPlugin(plugin);
    const shell = harness.getMockShell();
    const registry = shell.getDaemonRegistry();

    expect(registry.getAll()).toEqual(["cli:cli"]);
    expect(registry.get("cli:cli")?.pluginId).toBe("cli");
    expect(await registry.checkHealth("cli:cli")).toEqual({
      status: "error",
      message: "CLI interface not running",
      lastCheck: expect.any(Date),
      details: { hasInkApp: false, hasCallbacks: false },
    });
  });

  it("offers no channel, endpoint or interaction", async () => {
    await harness.installPlugin(createCliPlugin());
    const shell = harness.getMockShell();
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([]);
    expect(shell.listEndpoints()).toEqual([]);
    expect(shell.listInteractions()).toEqual([]);
  });

  it("registers no channel in the worker", async () => {
    const plugin = createCliPlugin();
    const shell = harness.getMockShell();
    await plugin.registerChannelsForExecution?.(shell);
    shell.getChannelRegistry().finalize();

    expect(shell.getChannelRegistry().listDescriptors()).toEqual([]);
    expect(shell.getDaemonRegistry().getAll()).toEqual([]);
  });
});
