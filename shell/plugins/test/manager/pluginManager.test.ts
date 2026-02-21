import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import type { IShell } from "@brains/plugins";
import {
  PluginEvent,
  PluginManager,
  PluginStatus,
} from "../../src/manager/pluginManager";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "../../src/test/mock-shell";

import { match, P } from "ts-pattern";

class TestPlugin implements Plugin {
  public id: string;
  public type: "core" | "service" | "interface" = "core";
  public version: string;
  public packageName: string;
  public name: string;
  public dependencies: string[];
  public registerCalled = false;
  public registerError = false;

  constructor(opts: {
    id: string;
    version: string;
    packageName?: string;
    name?: string;
    dependencies?: string[];
    registerError?: boolean;
  }) {
    this.id = opts.id;
    this.version = opts.version;
    this.packageName = opts.packageName ?? `@test/${opts.id}`;
    this.name = opts.name ?? this.id;
    this.dependencies = opts.dependencies ?? [];
    this.registerError = opts.registerError ?? false;
  }

  async register(_shell: IShell): Promise<PluginCapabilities> {
    if (this.registerError) {
      throw new Error(`Plugin ${this.id} registration failed`);
    }

    this.registerCalled = true;

    return {
      tools: [],
      resources: [],
    };
  }
}

describe("PluginManager", (): void => {
  let pluginManager: PluginManager;

  beforeEach((): void => {
    PluginManager.resetInstance();

    const logger = createSilentLogger();
    const mockShell = MockShell.createFresh({ logger });

    pluginManager = PluginManager.createFresh(logger);
    pluginManager.setShell(mockShell);
  });

  test("plugin lifecycle - register and initialize plugins", async (): Promise<void> => {
    // Create test plugins
    const pluginA = new TestPlugin({
      id: "plugin-a",
      version: "1.0.0",
    });

    const pluginB = new TestPlugin({
      id: "plugin-b",
      version: "1.0.0",
      dependencies: ["plugin-a"],
    });

    // Register plugins
    pluginManager.registerPlugin(pluginA);
    pluginManager.registerPlugin(pluginB);

    expect(pluginManager.hasPlugin("plugin-a")).toBe(true);
    expect(pluginManager.hasPlugin("plugin-b")).toBe(true);
    expect(pluginManager.getPluginStatus("plugin-a")).toBe(
      PluginStatus.REGISTERED,
    );
    expect(pluginManager.getPluginStatus("plugin-b")).toBe(
      PluginStatus.REGISTERED,
    );

    // Initialize plugins
    await pluginManager.initializePlugins();

    // Check statuses
    expect(pluginManager.getPluginStatus("plugin-a")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.getPluginStatus("plugin-b")).toBe(
      PluginStatus.INITIALIZED,
    );

    // Check register was called
    expect(pluginA.registerCalled).toBe(true);
    expect(pluginB.registerCalled).toBe(true);
  });

  test("plugin dependencies are respected during initialization", async (): Promise<void> => {
    // Create plugin initialization tracker
    const initOrder: string[] = [];

    // Create an event listener for initialization
    pluginManager.on(PluginEvent.INITIALIZED, (...args: unknown[]): void => {
      match(args)
        .with([P.string, P._], ([pluginId]) => {
          initOrder.push(pluginId);
        })
        .with([P.string], ([pluginId]) => {
          initOrder.push(pluginId);
        })
        .otherwise(() => {
          throw new Error("Invalid event arguments");
        });
    });

    // Create test plugins with dependencies
    const pluginA = new TestPlugin({
      id: "plugin-a",
      version: "1.0.0",
    });

    const pluginB = new TestPlugin({
      id: "plugin-b",
      version: "1.0.0",
      dependencies: ["plugin-a"],
    });

    const pluginC = new TestPlugin({
      id: "plugin-c",
      version: "1.0.0",
      dependencies: ["plugin-b"],
    });

    // Register plugins
    pluginManager.registerPlugin(pluginC); // Register in reverse order
    pluginManager.registerPlugin(pluginB);
    pluginManager.registerPlugin(pluginA);

    // Check initial statuses
    expect(pluginManager.getPluginStatus("plugin-a")).toBe(
      PluginStatus.REGISTERED,
    );
    expect(pluginManager.getPluginStatus("plugin-b")).toBe(
      PluginStatus.REGISTERED,
    );
    expect(pluginManager.getPluginStatus("plugin-c")).toBe(
      PluginStatus.REGISTERED,
    );

    // Initialize plugins
    await pluginManager.initializePlugins();

    // Check final statuses
    expect(pluginManager.getPluginStatus("plugin-a")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.getPluginStatus("plugin-b")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.getPluginStatus("plugin-c")).toBe(
      PluginStatus.INITIALIZED,
    );

    // Verify initialization order follows dependencies
    // A (no deps) should be initialized first, then B (depends on A), then C (depends on B)
    expect(initOrder).toEqual(["plugin-a", "plugin-b", "plugin-c"]);
  });

  test("plugin initialization handles errors", async (): Promise<void> => {
    // Create plugins with an error in the middle of the dependency chain
    const pluginA = new TestPlugin({
      id: "plugin-a",
      version: "1.0.0",
    });

    const errorPlugin = new TestPlugin({
      id: "plugin-b",
      version: "1.0.0",
      dependencies: ["plugin-a"],
      registerError: true, // This plugin will throw during registration
    });

    const pluginC = new TestPlugin({
      id: "plugin-c",
      version: "1.0.0",
      dependencies: ["plugin-b"], // This depends on the error plugin
    });

    const pluginD = new TestPlugin({
      id: "plugin-d",
      version: "1.0.0",
    });

    // Register all plugins
    pluginManager.registerPlugin(pluginA);
    pluginManager.registerPlugin(errorPlugin);
    pluginManager.registerPlugin(pluginC);
    pluginManager.registerPlugin(pluginD);

    // Track error events
    const errorHandler = mock((...args: unknown[]): void => {
      match(args)
        .with([P.string, P.instanceOf(Error)], ([_pluginId, error]) => {
          expect(error).toBeInstanceOf(Error);
        })
        .otherwise(() => {
          throw new Error("Invalid error event arguments");
        });
    });

    pluginManager.on(PluginEvent.ERROR, errorHandler);

    // Initialize plugins
    await pluginManager.initializePlugins();

    // Check statuses
    expect(pluginManager.getPluginStatus("plugin-a")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.getPluginStatus("plugin-b")).toBe(PluginStatus.ERROR);
    expect(pluginManager.getPluginStatus("plugin-c")).toBe(PluginStatus.ERROR); // Should be error due to dependency
    expect(pluginManager.getPluginStatus("plugin-d")).toBe(
      PluginStatus.INITIALIZED,
    ); // Should still initialize

    // Error handler should be called twice (for plugin-b and plugin-c)
    expect(errorHandler).toHaveBeenCalledTimes(2);

    // Plugin-a and plugin-d should have register called
    expect(pluginA.registerCalled).toBe(true);
    expect(errorPlugin.registerCalled).toBe(false); // Throws before setting flag
    expect(pluginC.registerCalled).toBe(false); // Never called due to dependency
    expect(pluginD.registerCalled).toBe(true);
  });

  test("plugin disable and enable functionality", async (): Promise<void> => {
    // Create test plugin
    const plugin = new TestPlugin({
      id: "test-plugin",
      version: "1.0.0",
    });

    // Track events
    const disableHandler = mock();
    const enableHandler = mock();

    pluginManager.on(PluginEvent.DISABLED, disableHandler);
    pluginManager.on(PluginEvent.ENABLED, enableHandler);

    // Register and initialize plugin
    pluginManager.registerPlugin(plugin);
    await pluginManager.initializePlugins();

    expect(pluginManager.getPluginStatus("test-plugin")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.isPluginInitialized("test-plugin")).toBe(true);

    // Disable plugin
    await pluginManager.disablePlugin("test-plugin");

    expect(pluginManager.getPluginStatus("test-plugin")).toBe(
      PluginStatus.DISABLED,
    );
    expect(pluginManager.isPluginInitialized("test-plugin")).toBe(false);
    expect(disableHandler).toHaveBeenCalledTimes(1);

    // Enable plugin
    await pluginManager.enablePlugin("test-plugin");

    expect(pluginManager.getPluginStatus("test-plugin")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.isPluginInitialized("test-plugin")).toBe(true);
    expect(enableHandler).toHaveBeenCalledTimes(1);
  });

  test("plugin registration can handle async operations", async () => {
    // Create a plugin that does async work during registration
    let asyncWorkCompleted = false;
    const asyncPlugin = {
      id: "async-plugin",
      version: "1.0.0",
      packageName: "@test/async-plugin",
      name: "Async Test Plugin",
      type: "core" as const,
      async register(_shell: IShell): Promise<PluginCapabilities> {
        // Simulate async work (e.g., initializing a database)
        await new Promise((resolve) => setTimeout(resolve, 10));
        asyncWorkCompleted = true;

        return {
          tools: [
            {
              name: "async_tool",
              description: "Test async tool",
              inputSchema: {},
              handler: async () => ({ success: true, formatted: "Success" }),
            },
          ],
          resources: [],
        };
      },
    };

    pluginManager.registerPlugin(asyncPlugin);

    // Async work should not be completed yet
    expect(asyncWorkCompleted).toBe(false);

    // Initialize plugins
    await pluginManager.initializePlugins();

    // Now async work should be completed
    expect(asyncWorkCompleted).toBe(true);

    const status = pluginManager.getPluginStatus("async-plugin");
    expect(status).toBe(PluginStatus.INITIALIZED);
  });
});
