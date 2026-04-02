import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import type { IShell } from "@brains/plugins";
import { PluginManager } from "../../src/manager/pluginManager";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "../../src/test/mock-shell";

describe("Plugin shutdown lifecycle", () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    PluginManager.resetInstance();
    const logger = createSilentLogger();
    const mockShell = createMockShell({ logger });
    pluginManager = PluginManager.createFresh(
      logger,
      mockShell.getDaemonRegistry(),
    );
    pluginManager.setShell(mockShell as unknown as IShell);
  });

  test("disablePlugin should call plugin.shutdown() when defined", async () => {
    const shutdownMock = mock(() => Promise.resolve());

    const plugin: Plugin = {
      id: "test-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/plugin",
      register: async (): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
      shutdown: shutdownMock,
    };

    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();

    await pluginManager.disablePlugin("test-plugin");

    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });

  test("disablePlugin should work when plugin has no shutdown method", async () => {
    const plugin: Plugin = {
      id: "no-shutdown-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/no-shutdown",
      register: async (): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
    };

    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();

    // Should not throw
    await pluginManager.disablePlugin("no-shutdown-plugin");
  });

  test("disablePlugin should continue if plugin.shutdown() throws", async () => {
    const plugin: Plugin = {
      id: "failing-shutdown-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/failing-shutdown",
      register: async (): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
      shutdown: async () => {
        throw new Error("shutdown failed");
      },
    };

    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();

    // Should not throw — shutdown errors are logged, not propagated
    await pluginManager.disablePlugin("failing-shutdown-plugin");
  });
});
