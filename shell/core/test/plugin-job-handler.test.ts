import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ServiceRegistry } from "@brains/service-registry";
import { createSilentLogger } from "@brains/utils";
import { PluginContextFactory } from "../src/plugins/pluginContextFactory";
import type { JobHandler, IJobQueueService } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import type { JobQueue } from "@brains/db";
import type { IEntityService } from "@brains/entity-service";
import type { IContentGenerator } from "@brains/content-generator";
import type { IViewRegistry } from "@brains/view-registry";
import type { IMessageBus } from "@brains/messaging-service";

describe("Plugin Job Handler Lifecycle", () => {
  let serviceRegistry: ServiceRegistry;
  let mockJobQueueService: IJobQueueService;
  let pluginContextFactory: PluginContextFactory;
  let logger: Logger;
  let registeredHandlers: Map<string, JobHandler>;

  beforeEach(async () => {
    // Ensure clean state by resetting singletons first
    ServiceRegistry.resetInstance();
    PluginContextFactory.resetInstance();

    // Setup test environment
    logger = createSilentLogger();
    serviceRegistry = ServiceRegistry.getInstance(logger);

    // Track registered handlers - ensure fresh map for each test
    registeredHandlers = new Map();

    // Create mock job queue service with fresh mocks
    mockJobQueueService = {
      registerHandler: mock((type: string, handler: JobHandler) => {
        registeredHandlers.set(type, handler);
      }),
      getRegisteredTypes: mock(() => Array.from(registeredHandlers.keys())),
      // Add unregisterHandler for internal use by PluginContextFactory
      unregisterHandler: mock((type: string) => {
        registeredHandlers.delete(type);
      }),
      enqueue: mock(async (type: string, data: unknown) => {
        const handler = registeredHandlers.get(type);
        if (handler && handler.validateAndParse(data) === null) {
          throw new Error("Invalid job data");
        }
        return `job-${Math.random().toString(36).slice(2)}`;
      }),
      dequeue: mock(
        async (): Promise<JobQueue | null> => ({
          id: "job-123",
          type: Array.from(registeredHandlers.keys())[0] ?? "test",
          data: JSON.stringify({}),
          status: "pending",
          priority: 0,
          maxRetries: 3,
          retryCount: 0,
          createdAt: Date.now(),
          scheduledFor: Date.now(),
          startedAt: null,
          completedAt: null,
          lastError: null,
          metadata: {
            interfaceId: "test",
            userId: "test-user",
            operationType: "entity_processing",
          },
          source: "test",
          result: null,
        }),
      ),
      getHandler: mock((type: string) => {
        return registeredHandlers.get(type);
      }),
      complete: mock(async (_jobId: string, _result?: unknown) => {}),
      fail: mock(async (_jobId: string, _error: Error) => {}),
      getStatus: mock(async (_jobId: string) => null),
      update: mock(async (_jobId: string, _data: unknown) => {}),
      getStatusByEntityId: mock(async (_entityId: string) => null),
      getStats: mock(async () => ({
        pending: 0,
        processing: 0,
        failed: 0,
        completed: 0,
        total: 0,
      })),
      cleanup: mock(async (_olderThanMs: number) => 0),
      getActiveJobs: mock(async (_types?: string[]) => []),
    };

    // Register mock job queue service
    serviceRegistry.register("jobQueueService", () => mockJobQueueService);

    // Create mock shell with required services
    const mockEntityService: IEntityService = {
      getEntity: mock(async () => null),
      createEntity: mock(async () => ({
        entityId: "test-id",
        jobId: "job-123",
      })),
      updateEntity: mock(async () => ({
        entityId: "test-id",
        jobId: "job-123",
      })),
      deleteEntity: mock(
        async (_entityType: string, _id: string): Promise<boolean> => true,
      ),
      listEntities: mock(async () => []),
      search: mock(async () => []),
      getEntityTypes: mock(() => []),
      hasEntityType: mock(() => false),
      serializeEntity: mock(() => "# Mock Entity\n\nMock content"),
      deserializeEntity: mock(() => ({ content: "Mock content" })),
      getAsyncJobStatus: mock(async () => ({ status: "completed" as const })),
    };

    const mockContentGenerator: IContentGenerator = {
      registerTemplate: mock(() => {}),
      getTemplate: mock(() => null),
      listTemplates: mock(() => []),
      generateContent: mock(
        async (_templateName: string, _context = {}) => ({}),
      ) as IContentGenerator["generateContent"],
      generateWithRoute: mock(async () => ""),
      formatContent: mock(() => ""),
      parseContent: mock(
        (_templateName: string, _content: string) => ({}),
      ) as IContentGenerator["parseContent"],
    };

    const mockViewRegistry: IViewRegistry = {
      registerRoute: mock(() => {}),
      getRoute: mock(() => undefined),
      findRoute: mock(() => undefined),
      listRoutes: mock(() => []),
      listRoutesByPlugin: mock(() => []),
      validateRoute: mock(() => true),
      registerViewTemplate: mock(() => {}),
      getViewTemplate: mock(() => undefined),
      listViewTemplates: mock(() => []),
      validateViewTemplate: mock(() => true),
      findViewTemplate: mock(() => undefined),
      getRenderer: mock(() => undefined),
      hasRenderer: mock(() => false),
      listFormats: mock(() => []),
    };

    const mockMessageBus: IMessageBus = {
      send: mock(async () => ({ success: true })),
      subscribe: mock(() => () => {}),
      unsubscribe: mock(() => {}),
    };

    const mockShell = {
      getEntityService: (): IEntityService => mockEntityService,
      getContentGenerator: (): IContentGenerator => mockContentGenerator,
      getViewRegistry: (): IViewRegistry => mockViewRegistry,
      getMessageBus: (): IMessageBus => mockMessageBus,
      getJobQueueService: (): IJobQueueService => mockJobQueueService,
    };

    // Register mock shell
    serviceRegistry.register("shell", () => mockShell);

    // Create plugin context factory
    pluginContextFactory = PluginContextFactory.getInstance(
      serviceRegistry,
      logger,
      new Map(),
    );
  });

  afterEach(async () => {
    // Clean up singleton instances
    ServiceRegistry.resetInstance();
    PluginContextFactory.resetInstance();
  });

  it("should register a plugin job handler with automatic namespacing", async () => {
    const pluginId = "test-plugin";
    const context = pluginContextFactory.createPluginContext(pluginId);

    // Create a mock job handler
    const mockHandler: JobHandler = {
      process: async (data: unknown) => {
        return { processed: true, data };
      },
      validateAndParse: (data: unknown) => {
        return data; // Simple pass-through for testing
      },
      onError: async (error: Error) => {
        console.error("Job error:", error);
      },
    };

    // Register the handler
    context.registerJobHandler("process-data", mockHandler);

    // Verify it's registered with namespaced type
    const registeredTypes = mockJobQueueService.getRegisteredTypes();
    expect(registeredTypes).toContain("test-plugin:process-data");

    // Verify the mock was called correctly
    expect(mockJobQueueService.registerHandler).toHaveBeenCalledWith(
      "test-plugin:process-data",
      mockHandler,
    );
  });

  it("should process jobs with plugin-registered handlers", async () => {
    const pluginId = "test-plugin";
    const context = pluginContextFactory.createPluginContext(pluginId);

    let processedData: unknown = null;

    // Create a job handler that captures processed data
    const handler: JobHandler = {
      process: async (data: unknown) => {
        processedData = data;
        return { success: true, result: `Processed: ${JSON.stringify(data)}` };
      },
      validateAndParse: (data: unknown) => data,
    };

    // Register and enqueue a job
    context.registerJobHandler("test-job", handler);

    const jobData = { message: "Hello from test" };
    const jobId = await context.enqueueJob("test-job", jobData, {
      source: "test-plugin",
      metadata: {
        interfaceId: "test-plugin",
        userId: "system",
        operationType: "entity_processing",
      },
    });

    // Verify job was enqueued
    expect(mockJobQueueService.enqueue).toHaveBeenCalledWith(
      "test-plugin:test-job",
      jobData,
      {
        source: "test-plugin",
        metadata: {
          interfaceId: "test-plugin",
          userId: "system",
          operationType: "entity_processing",
        },
      },
    );

    // Simulate processing by calling the handler directly
    const registeredHandler = registeredHandlers.get("test-plugin:test-job");
    expect(registeredHandler).toBeTruthy();
    if (registeredHandler) {
      const mockProgressReporter = {
        async report(): Promise<void> {},
        createSub(): ProgressReporter {
          return mockProgressReporter as unknown as ProgressReporter;
        },
        startHeartbeat(): void {},
        stopHeartbeat(): void {},
        toCallback(): () => Promise<void> {
          return async (): Promise<void> => {};
        },
      } as unknown as ProgressReporter;
      const result = await registeredHandler.process(
        jobData,
        jobId,
        mockProgressReporter,
      );
      expect(result).toEqual({
        success: true,
        result: `Processed: ${JSON.stringify(jobData)}`,
      });
    }

    // Verify processing
    expect(processedData).toEqual(jobData);
  });

  it("should clean up handlers when plugin is unloaded", () => {
    const pluginId = "cleanup-test";
    const context = pluginContextFactory.createPluginContext(pluginId);

    // Register a handler
    const handler: JobHandler = {
      process: async () => ({ done: true }),
      validateAndParse: (data: unknown) => data,
    };

    context.registerJobHandler("cleanup-job", handler);

    // Verify it's registered
    let types = mockJobQueueService.getRegisteredTypes();
    expect(types).toContain("cleanup-test:cleanup-job");

    // Clean up the plugin
    pluginContextFactory.cleanupPlugin(pluginId);

    // Verify handler is removed
    types = mockJobQueueService.getRegisteredTypes();
    expect(types).not.toContain("cleanup-test:cleanup-job");
  });

  it("should handle validation errors gracefully", async () => {
    const pluginId = "validation-test";
    const context = pluginContextFactory.createPluginContext(pluginId);

    // Handler that rejects invalid data
    const handler: JobHandler = {
      process: async (data: unknown) => {
        return { processed: data };
      },
      validateAndParse: (data: unknown) => {
        if (typeof data !== "object" || !data || !("required" in data)) {
          return null; // Invalid data
        }
        return data;
      },
    };

    context.registerJobHandler("validate-job", handler);

    // Try to enqueue invalid data
    try {
      await context.enqueueJob(
        "validate-job",
        {
          invalid: true,
        },
        {
          source: "test-plugin",
          metadata: {
            interfaceId: "test-plugin",
            userId: "system",
            operationType: "entity_processing",
          },
        },
      );
      expect(false).toBe(true); // Should not reach here
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("Job operation failed: enqueueJob");
    }
  });

  it("should handle multiple plugins with different handlers", async () => {
    // Plugin 1
    const plugin1Context = pluginContextFactory.createPluginContext("plugin-1");
    const handler1: JobHandler = {
      process: async () => ({ plugin: 1 }),
      validateAndParse: (data: unknown) => data,
    };
    plugin1Context.registerJobHandler("task", handler1);

    // Plugin 2
    const plugin2Context = pluginContextFactory.createPluginContext("plugin-2");
    const handler2: JobHandler = {
      process: async () => ({ plugin: 2 }),
      validateAndParse: (data: unknown) => data,
    };
    plugin2Context.registerJobHandler("task", handler2);

    // Both should be registered with different namespaces
    const types = mockJobQueueService.getRegisteredTypes();
    expect(types).toContain("plugin-1:task");
    expect(types).toContain("plugin-2:task");

    // Enqueue jobs for each plugin
    await plugin1Context.enqueueJob(
      "task",
      {},
      {
        source: "plugin-1",
        metadata: {
          interfaceId: "plugin-1",
          userId: "system",
          operationType: "entity_processing",
        },
      },
    );
    await plugin2Context.enqueueJob(
      "task",
      {},
      {
        source: "plugin-2",
        metadata: {
          interfaceId: "plugin-2",
          userId: "system",
          operationType: "entity_processing",
        },
      },
    );

    // Verify both were enqueued with correct types
    expect(mockJobQueueService.enqueue).toHaveBeenCalledWith(
      "plugin-1:task",
      {},
      {
        source: "plugin-1",
        metadata: {
          interfaceId: "plugin-1",
          userId: "system",
          operationType: "entity_processing",
        },
      },
    );
    expect(mockJobQueueService.enqueue).toHaveBeenCalledWith(
      "plugin-2:task",
      {},
      {
        source: "plugin-2",
        metadata: {
          interfaceId: "plugin-2",
          userId: "system",
          operationType: "entity_processing",
        },
      },
    );

    // Verify handlers are different
    const registeredHandler1 = registeredHandlers.get("plugin-1:task");
    const registeredHandler2 = registeredHandlers.get("plugin-2:task");
    expect(registeredHandler1).not.toBe(registeredHandler2);

    // Test that handlers return different results
    if (registeredHandler1 && registeredHandler2) {
      const mockProgressReporter = {
        async report(): Promise<void> {},
        createSub(): ProgressReporter {
          return mockProgressReporter as unknown as ProgressReporter;
        },
        startHeartbeat(): void {},
        stopHeartbeat(): void {},
        toCallback(): () => Promise<void> {
          return async (): Promise<void> => {};
        },
      } as unknown as ProgressReporter;
      const result1 = await registeredHandler1.process(
        {},
        "test-1",
        mockProgressReporter,
      );
      const result2 = await registeredHandler2.process(
        {},
        "test-2",
        mockProgressReporter,
      );
      expect(result1).toEqual({ plugin: 1 });
      expect(result2).toEqual({ plugin: 2 });
    }
  });
});
