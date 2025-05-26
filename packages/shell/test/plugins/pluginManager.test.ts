import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { Plugin, PluginContext, PluginCapabilities } from "@brains/types";
import {
  PluginEvent,
  PluginManager,
  PluginStatus,
} from "@/plugins/pluginManager";
import { Registry } from "@/registry/registry";

import { createSilentLogger, type Logger } from "@personal-brain/utils";
import { MessageBus } from "@/messaging/messageBus";

interface MockService {
  id: string;
  getName(): string;
  getVersion(): string;
}
import { match, P } from "ts-pattern";

// Create a simple test plugin
class TestPlugin implements Plugin {
  public id: string;
  public version: string;
  public name: string;
  public dependencies: string[];
  public registerCalled = false;
  public registerError = false;

  constructor(opts: {
    id: string;
    version: string;
    name?: string;
    dependencies?: string[];
    registerError?: boolean;
  }) {
    this.id = opts.id;
    this.version = opts.version;
    this.name = opts.name ?? this.id;
    this.dependencies = opts.dependencies ?? [];
    this.registerError = opts.registerError ?? false;
  }

  async register(context: PluginContext): Promise<PluginCapabilities> {
    if (this.registerError) {
      throw new Error(`Plugin ${this.id} registration failed`);
    }

    this.registerCalled = true;
    const { registry, logger } = context;

    // Register a test service
    registry.register(`service:${this.id}`, () => {
      return {
        id: this.id,
        getName: (): string => this.name,
        getVersion: (): string => this.version,
      };
    });

    logger.info(`Registered service for plugin ${this.id}`);

    // Return empty capabilities
    return {
      tools: [],
      resources: [],
    };
  }
}

describe("PluginManager", (): void => {
  let pluginManager: PluginManager;
  let registry: Registry;
  let logger: Logger;
  let messageBus: MessageBus;

  beforeEach((): void => {
    // Reset singletons
    PluginManager.resetInstance();
    Registry.resetInstance();
    MessageBus.resetInstance();

    // Create fresh instances with mock logger
    logger = createSilentLogger();
    registry = Registry.createFresh(logger);
    messageBus = MessageBus.createFresh(logger);
    pluginManager = PluginManager.createFresh(registry, logger, messageBus);
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

    // Services should be registered
    expect(registry.has("service:plugin-a")).toBe(true);
    expect(registry.has("service:plugin-b")).toBe(true);

    // Resolve services
    const serviceA = registry.resolve<MockService>("service:plugin-a");
    const serviceB = registry.resolve<MockService>("service:plugin-b");

    expect(serviceA.id).toBe("plugin-a");
    expect(serviceB.id).toBe("plugin-b");
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
    pluginManager.disablePlugin("test-plugin");

    expect(pluginManager.getPluginStatus("test-plugin")).toBe(
      PluginStatus.DISABLED,
    );
    expect(pluginManager.isPluginInitialized("test-plugin")).toBe(false);
    expect(disableHandler).toHaveBeenCalledTimes(1);

    // Enable plugin
    pluginManager.enablePlugin("test-plugin");

    expect(pluginManager.getPluginStatus("test-plugin")).toBe(
      PluginStatus.INITIALIZED,
    );
    expect(pluginManager.isPluginInitialized("test-plugin")).toBe(true);
    expect(enableHandler).toHaveBeenCalledTimes(1);
  });
});
