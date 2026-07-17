import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { PluginStatus } from "../../src/manager/types";
import type { IShell } from "@brains/plugins";
import { PluginManager } from "../../src/manager/pluginManager";
import { createSilentLogger } from "@brains/test-utils";
import { createMockShell } from "../../src/test/mock-shell";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let settle: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    settle = resolve;
  });
  return { promise, resolve: (): void => settle?.() };
}

describe("Plugin shutdown lifecycle", () => {
  let pluginManager: PluginManager;
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    PluginManager.resetInstance();
    const logger = createSilentLogger();
    mockShell = createMockShell({ logger });
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

  test("concurrent disable callers join one teardown", async () => {
    const shutdownStarted = deferred();
    const releaseShutdown = deferred();
    const plugin: Plugin = {
      id: "concurrent-shutdown",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/concurrent-shutdown",
      register: async (): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
      shutdown: async (): Promise<void> => {
        shutdownStarted.resolve();
        await releaseShutdown.promise;
      },
    };
    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();

    const firstDisable = pluginManager.disablePlugin("concurrent-shutdown");
    await shutdownStarted.promise;
    let secondSettled = false;
    const secondDisable = pluginManager
      .disablePlugin("concurrent-shutdown")
      .then(() => {
        secondSettled = true;
      });
    await Promise.resolve();

    expect(secondSettled).toBe(false);
    releaseShutdown.resolve();
    await Promise.all([firstDisable, secondDisable]);
    expect(secondSettled).toBe(true);
  });

  test("drains scoped resource release before plugin shutdown", async () => {
    const releaseStarted = deferred();
    const releaseResources = deferred();
    let shutdownCalled = false;
    mockShell.unregisterPluginCapabilities = async (): Promise<void> => {
      releaseStarted.resolve();
      await releaseResources.promise;
    };
    const plugin: Plugin = {
      id: "ordered-shutdown",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/ordered-shutdown",
      register: async (): Promise<PluginCapabilities> => ({
        tools: [],
        resources: [],
      }),
      shutdown: async (): Promise<void> => {
        shutdownCalled = true;
      },
    };
    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();

    const disabling = pluginManager.disablePlugin("ordered-shutdown");
    await releaseStarted.promise;
    expect(shutdownCalled).toBe(false);

    releaseResources.resolve();
    await disabling;
    expect(shutdownCalled).toBe(true);
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

  test("disablePlugin should close message subscriptions and unregister handlers", async () => {
    let messageCalls = 0;
    const unregisterHandlers = mock(() => {});
    const unregisterCapabilities = mock(() => {});
    mockShell.unregisterPluginCapabilities = unregisterCapabilities;
    const jobQueueService = mockShell.getJobQueueService();
    jobQueueService.unregisterPluginHandlers = unregisterHandlers;
    mockShell.getJobQueueService = (): typeof jobQueueService =>
      jobQueueService;

    const plugin: Plugin = {
      id: "scoped-plugin",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/scoped",
      register: async (shell): Promise<PluginCapabilities> => {
        shell.getMessageBus().subscribe("scoped:event", async () => {
          messageCalls++;
          return { success: true };
        });
        shell.registerDaemon(
          "scoped-plugin:daemon",
          { start: async () => {}, stop: async () => {} },
          "scoped-plugin",
        );
        return { tools: [], resources: [] };
      },
    };

    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();
    await mockShell.getMessageBus().send({
      type: "scoped:event",
      payload: {},
      sender: "test",
    });
    expect(messageCalls).toBe(1);
    expect(mockShell.getDaemonRegistry().has("scoped-plugin:daemon")).toBe(
      true,
    );

    await pluginManager.disablePlugin("scoped-plugin");
    await mockShell.getMessageBus().send({
      type: "scoped:event",
      payload: {},
      sender: "test",
    });

    expect(messageCalls).toBe(1);
    expect(unregisterHandlers).toHaveBeenCalledWith("scoped-plugin");
    expect(unregisterCapabilities).toHaveBeenCalledWith("scoped-plugin");
    expect(mockShell.getDaemonRegistry().has("scoped-plugin:daemon")).toBe(
      false,
    );
  });

  test("failed registration should roll back scoped resources", async () => {
    const registrationError = new Error("registration failed");
    const shutdownMock = mock(async () => {});
    let messageCalls = 0;
    const plugin: Plugin = {
      id: "failing-registration",
      version: "1.0.0",
      type: "service",
      description: "Test",
      packageName: "@test/failing-registration",
      register: async (shell): Promise<PluginCapabilities> => {
        shell.getMessageBus().subscribe("failed:event", async () => {
          messageCalls++;
          return { success: true };
        });
        shell
          .getEntityRegistry()
          .registerEntityType("failed-entity", {} as never, {} as never);
        shell.getDataSourceRegistry().register({
          id: "failed-source",
          name: "Failed source",
        });
        shell.getAttachmentRegistry().register("failed-entity", "preview", {
          resolve: () => undefined,
        });
        shell
          .getInsightsRegistry()
          .register("failed-insight", async () => ({}));
        throw registrationError;
      },
      shutdown: shutdownMock,
    };

    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();
    await mockShell.getMessageBus().send({
      type: "failed:event",
      payload: {},
      sender: "test",
    });

    expect(messageCalls).toBe(0);
    expect(mockShell.getEntityRegistry().hasEntityType("failed-entity")).toBe(
      false,
    );
    expect(mockShell.getDataSourceRegistry().has("shell:failed-source")).toBe(
      false,
    );
    expect(
      mockShell.getAttachmentRegistry().hasProvider("failed-entity", "preview"),
    ).toBe(false);
    expect(mockShell.getInsightsRegistry().getTypes()).not.toContain(
      "failed-insight",
    );
    expect(shutdownMock).toHaveBeenCalledTimes(1);
    expect(pluginManager.getPluginStatus("failing-registration")).toBe(
      PluginStatus.ERROR,
    );
    expect(pluginManager.getFailedPlugins()[0]?.error).toBe(registrationError);
  });
});
