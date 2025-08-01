import { describe, expect, test, beforeEach, mock } from "bun:test";
import type { BaseEntity } from "@brains/types";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import type { IShell } from "@brains/types";
import type { IJobQueueService } from "@brains/job-queue";
import {
  PluginEvent,
  PluginManager,
  PluginStatus,
} from "@/plugins/pluginManager";
import { ServiceRegistry } from "@brains/service-registry";
import type { Shell } from "@/shell";

import { createSilentLogger, type Logger } from "@brains/utils";
import { MessageBus } from "@brains/messaging-service";

import { match, P } from "ts-pattern";

// Create a simple test plugin
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

    // Return empty capabilities
    return {
      tools: [],
      resources: [],
      commands: [],
    };
  }
}

describe("PluginManager", (): void => {
  let pluginManager: PluginManager;
  let serviceRegistry: ServiceRegistry;
  let logger: Logger;

  beforeEach((): void => {
    // Reset singletons
    PluginManager.resetInstance();
    ServiceRegistry.resetInstance();
    MessageBus.resetInstance();

    // Create fresh instances with mock logger
    logger = createSilentLogger();
    serviceRegistry = ServiceRegistry.createFresh(logger);

    // Register a mock shell with required services
    const mockShell = {
      getEntityService: (): {
        createEntity: <T extends BaseEntity>(
          data: Partial<T>,
        ) => Promise<{ entityId: string; jobId: string }>;
        getEntity: <T extends BaseEntity>(
          entityType: string,
          id: string,
        ) => Promise<T | null>;
        updateEntity: <T extends BaseEntity>(
          entity: T,
        ) => Promise<{ entityId: string; jobId: string }>;
        deleteEntity: (entityType: string, id: string) => Promise<boolean>;
        listEntities: <T extends BaseEntity>(
          entityType: string,
          options?: unknown,
        ) => Promise<T[]>;
        search: <T extends BaseEntity>(
          query: string,
          options?: unknown,
        ) => Promise<T[]>;
        getEntityTypes: () => string[];
        getAdapter: (entityType: string) => unknown;
        hasAdapter: (entityType: string) => boolean;
        importRawEntity: (entityType: string, data: unknown) => Promise<void>;
      } => ({
        createEntity: async (): Promise<{
          entityId: string;
          jobId: string;
        }> => ({ entityId: "test-id", jobId: "job-123" }),
        getEntity: async (): Promise<null> => null,
        updateEntity: async (): Promise<{
          entityId: string;
          jobId: string;
        }> => ({ entityId: "test-id", jobId: "job-123" }),
        deleteEntity: async (): Promise<boolean> => true,
        listEntities: async <T extends BaseEntity>(): Promise<T[]> => [] as T[],
        search: async <T extends BaseEntity>(): Promise<T[]> => [] as T[],
        getEntityTypes: (): string[] => [],
        getAdapter: (): null => null,
        hasAdapter: (): boolean => false,
        importRawEntity: async (): Promise<void> => undefined,
      }),
      getContentGenerator: (): {
        generateContent: <T>(
          templateName: string,
          context?: unknown,
        ) => Promise<T>;
        parseContent: <T>(templateName: string, content: string) => T;
        registerTemplate: (name: string, template: unknown) => void;
        getTemplate: (name: string) => unknown;
        listTemplates: () => unknown[];
      } => ({
        generateContent: async <T>(): Promise<T> => ({}) as T,
        parseContent: <T>(): T => ({}) as T,
        registerTemplate: (): void => undefined,
        getTemplate: (): null => null,
        listTemplates: (): unknown[] => [],
      }),
      getViewRegistry: (): {
        registerRoute: (route: unknown) => void;
        getRoute: (path: string) => unknown;
        listRoutes: () => unknown[];
        registerViewTemplate: (template: unknown) => void;
        getViewTemplate: (name: string) => unknown;
        listViewTemplates: () => unknown[];
        validateViewTemplate: (
          templateName: string,
          content: unknown,
        ) => boolean;
      } => ({
        registerRoute: (): void => undefined,
        getRoute: (): undefined => undefined,
        listRoutes: (): unknown[] => [],
        registerViewTemplate: (): void => undefined,
        getViewTemplate: (): undefined => undefined,
        listViewTemplates: (): unknown[] => [],
        validateViewTemplate: (): boolean => true,
      }),
      getMessageBus: (): MessageBus => MessageBus.getInstance(logger),
      getJobQueueService: (): IJobQueueService => ({
        registerHandler: mock(() => {}),
        unregisterHandler: mock(() => {}),
        unregisterPluginHandlers: mock(() => {}),
        getHandler: mock(() => undefined),
        enqueue: mock(async () => "job-123"),
        dequeue: mock(async () => null),
        complete: mock(async () => {}),
        fail: mock(async () => {}),
        update: mock(async () => {}),
        getStatus: mock(async () => null),
        getStatusByEntityId: mock(async () => null),
        getStats: mock(async () => ({
          pending: 0,
          processing: 0,
          failed: 0,
          completed: 0,
          total: 0,
        })),
        cleanup: mock(async () => 0),
        getActiveJobs: mock(async () => []),
        getRegisteredTypes: mock(() => []),
      }),
    };
    serviceRegistry.register("shell", () => mockShell as unknown as Shell);

    pluginManager = PluginManager.createFresh(serviceRegistry, logger);
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

    // Note: Registry service registration is no longer part of the plugin interface
    // Plugins now use proper abstraction layers instead of direct registry access
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
    const pm = PluginManager.createFresh(serviceRegistry, logger);

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
              handler: async () => ({ success: true }),
            },
          ],
          resources: [],
          commands: [],
        };
      },
    };

    pm.registerPlugin(asyncPlugin);

    // Async work should not be completed yet
    expect(asyncWorkCompleted).toBe(false);

    // Initialize plugins
    await pm.initializePlugins();

    // Now async work should be completed
    expect(asyncWorkCompleted).toBe(true);

    const status = pm.getPluginStatus("async-plugin");
    expect(status).toBe(PluginStatus.INITIALIZED);
  });
});
