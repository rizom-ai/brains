import type { BaseEntity, EntityInput } from "@brains/types";
import type {
  MessageHandler,
  MessageSender,
  MessageResponse,
} from "@brains/messaging-service";
import type {
  Plugin,
  PluginContext,
  PluginTool,
  ContentGenerationConfig,
} from "@brains/plugin-utils";
import type { EntityService } from "@brains/entity-service";
import type { EntityAdapter } from "@brains/types";
import { createSilentLogger, type Logger } from "@brains/utils";
import type { JobContext, JobQueue } from "@brains/db";
import type { BatchJobStatus, BatchOperation } from "@brains/job-queue";
import type { Command } from "@brains/message-interface";
import type { z } from "zod";

export interface PluginTestHarnessOptions {
  /**
   * Logger instance to use
   */
  logger?: Logger;
}

/**
 * Simple plugin test harness that focuses on testing plugin behavior
 * without the complexity of the full Shell infrastructure
 */
export class PluginTestHarness {
  private tools = new Map<string, PluginTool>();
  private entities = new Map<string, BaseEntity[]>();
  private entityIdCounter = 0;
  private logger: Logger;
  private installedPlugins: Plugin[] = [];
  private mockEntityRegistry: {
    registeredTypes: Map<
      string,
      { schema: z.ZodType<BaseEntity>; adapter: EntityAdapter<BaseEntity> }
    >;
    registerEntityType: <T extends BaseEntity>(
      entityType: string,
      schema: z.ZodType<T>,
      adapter: EntityAdapter<T>,
    ) => void;
  };

  constructor(options: PluginTestHarnessOptions = {}) {
    this.logger = options.logger ?? createSilentLogger("test-harness");

    // Initialize the mock entity registry
    this.mockEntityRegistry = {
      registeredTypes: new Map(),
      registerEntityType: <T extends BaseEntity>(
        entityType: string,
        schema: z.ZodType<T>,
        adapter: EntityAdapter<T>,
      ): void => {
        this.mockEntityRegistry.registeredTypes.set(entityType, {
          schema: schema as z.ZodType<BaseEntity>,
          adapter: adapter as EntityAdapter<BaseEntity>,
        });
        this.logger.debug(`Registered entity type: ${entityType}`);
      },
    };
  }

  /**
   * Set up the test environment
   */
  async setup(): Promise<void> {
    // Reset state
    this.reset();
  }

  /**
   * Install a plugin in the test harness
   */
  async installPlugin(plugin: Plugin): Promise<void> {
    const context = this.getPluginContext();

    const capabilities = await plugin.register(context);

    // Collect tools
    for (const tool of capabilities.tools) {
      this.tools.set(tool.name, tool);
    }

    this.installedPlugins.push(plugin);
  }

  /**
   * Create a test entity
   */
  async createTestEntity<T extends BaseEntity = BaseEntity>(
    entityType: string,
    data: EntityInput<T>,
  ): Promise<T> {
    const id = data.id ?? `${entityType}-${++this.entityIdCounter}`;
    const now = new Date().toISOString();

    const entity = {
      ...data,
      id,
      entityType,
      content: "content" in data ? data.content : "Test content",
      created: data.created ?? now,
      updated: data.updated ?? now,
    } as T;

    // Store in our simple in-memory store
    const entities = this.entities.get(entityType) ?? [];
    entities.push(entity as BaseEntity);
    this.entities.set(entityType, entities);

    return entity;
  }

  /**
   * Get entity by ID
   */
  async getEntity<T extends BaseEntity = BaseEntity>(
    entityType: string,
    id: string,
  ): Promise<T | null> {
    const entities = this.entities.get(entityType) ?? [];
    return (entities.find((e) => e.id === id) as T | undefined) ?? null;
  }

  /**
   * List entities by type
   */
  async listEntities<T extends BaseEntity = BaseEntity>(
    entityType: string,
  ): Promise<T[]> {
    return (this.entities.get(entityType) ?? []) as T[];
  }

  /**
   * Execute a query (simplified for testing)
   */
  async query(query: string): Promise<Record<string, unknown>> {
    // Simple implementation - just search by content
    const allEntities = Array.from(this.entities.values()).flat();
    const matches = allEntities.filter((e) =>
      e.content.toLowerCase().includes(query.toLowerCase()),
    );

    return {
      query,
      results: matches,
      count: matches.length,
    };
  }

  /**
   * Get the shell (returns null - we don't use Shell in simple harness)
   */
  getShell(): null {
    return null;
  }

  /**
   * Get installed plugins
   */
  getInstalledPlugins(): Plugin[] {
    return this.installedPlugins;
  }

  /**
   * Get temp directory (not used in simple harness)
   */
  getTempDir(): string {
    return "/tmp/test";
  }

  /**
   * Create temp subdirectory (not used in simple harness)
   */
  createTempSubdir(name: string): string {
    return `/tmp/test/${name}`;
  }

  /**
   * Get plugin context
   */
  getPluginContext(): PluginContext {
    return {
      pluginId: "test-plugin",
      logger: this.logger,
      sendMessage: this.createMockMessageSender(),
      subscribe: this.createMockSubscribe(),
      registerEntityType: <T extends BaseEntity>(
        entityType: string,
        schema: z.ZodType<T>,
        adapter: EntityAdapter<T>,
      ): void => {
        // For test harness, register the entity type in our mock registry
        this.mockEntityRegistry.registerEntityType(entityType, schema, adapter);
      },
      generateContent: async <T = unknown>(
        config: ContentGenerationConfig,
      ): Promise<T> => {
        // For test harness, return mock data based on template name
        if (
          config.templateName.includes("landing") ||
          config.templateName.includes("hero")
        ) {
          return {
            title: "Test Brain",
            tagline: "Test Description",
            hero: {
              headline: "Your Personal Knowledge Hub",
              subheadline:
                "Organize, connect, and discover your digital thoughts",
              ctaText: "View Dashboard",
              ctaLink: "/dashboard",
            },
          } as T;
        }

        // Default response for shell:knowledge-query template
        if (config.templateName === "shell:knowledge-query") {
          return {
            message: "Mock response from content generation",
            results: [],
          } as T;
        }

        // Default response
        return {
          prompt: config.prompt,
          response: "Mock response from content generation",
          results: [],
        } as T;
      },
      parseContent: <T = unknown>(templateName: string, content: string): T => {
        // For test harness, return mock parsed data
        return {
          parsedContent: content,
          templateName,
          mockParsed: true,
        } as T;
      },
      formatContent: <T = unknown>(
        templateName: string,
        data: T,
        options?: { truncate?: number },
      ): string => {
        // For test harness, return mock formatted content
        let formatted = JSON.stringify({
          templateName,
          data,
          mockFormatted: true,
        });

        // Apply truncation if requested
        if (options?.truncate && formatted.length > options.truncate) {
          formatted = formatted.substring(0, options.truncate) + "...";
        }

        return formatted;
      },
      registerTemplate: (): void => {
        // Mock implementation for test harness
      },
      registerTemplates: (): void => {
        // Mock implementation for test harness
      },
      generateWithRoute: async (): Promise<string> => {
        // Mock implementation for test harness
        return "mock route content";
      },
      // View template access (replaces direct viewRegistry access)
      getViewTemplate: (): undefined => undefined,

      // Route finding abstraction
      getRoute: (): undefined => undefined,
      findRoute: (): undefined => undefined,
      listRoutes: () => [],
      validateRoute: (): boolean => true,

      // Template finding abstraction
      findViewTemplate: (): undefined => undefined,
      listViewTemplates: () => [],
      validateTemplate: (): boolean => true,
      // Plugin metadata access (scoped to current plugin by default)
      getPluginPackageName: (): string => "test-plugin-package",
      // Entity service access - direct access to mock entity service
      entityService: this.createMockEntityService(),
      // Route registration
      registerRoutes: (): void => {
        // Mock implementation for test harness
      },
      // Generic job queue access (required)
      enqueueJob: async (
        _type: string,
        _data: unknown,
        _options: {
          source: string;
          metadata: JobContext;
          priority?: number;
          maxRetries?: number;
          delayMs?: number;
        },
      ): Promise<string> => {
        // Mock implementation - return a fake job ID
        return "mock-job-id-" + Date.now();
      },
      getJobStatus: async (): Promise<{
        status: "pending" | "processing" | "completed" | "failed";
        result?: unknown;
        error?: string;
      } | null> => {
        // Mock implementation - return completed job status
        return {
          status: "completed",
          result: "mock-result",
        };
      },
      // Batch operations (required)
      enqueueBatch: async (
        _operations: BatchOperation[],
        _options: {
          source: string;
          metadata: JobContext;
          priority?: number;
          maxRetries?: number;
        },
      ): Promise<string> => {
        // Mock implementation - return a fake batch ID
        return "mock-batch-id-" + Date.now();
      },
      // Wait for job completion (with timeout)
      waitForJob: async (): Promise<unknown> => {
        // Mock implementation - return mock content
        return "Mock generated content";
      },
      // Get batch operation status
      getBatchStatus: async (): Promise<BatchJobStatus | null> => {
        // Mock implementation - return null for test harness
        return null;
      },
      // Job handler registration
      registerJobHandler: (): void => {
        // Mock implementation for test harness
      },
      // Daemon registration
      registerDaemon: (): void => {
        // Mock implementation for test harness
      },
      // Command discovery
      getAllCommands: async (): Promise<Command[]> => {
        // Mock implementation for test harness - return empty array
        return [];
      },

      // Get active jobs (for monitoring)
      getActiveJobs: async (_types?: string[]): Promise<JobQueue[]> => {
        // Mock implementation for test harness - return empty array
        return [];
      },

      // Get active batches (for monitoring)
      getActiveBatches: async (): Promise<
        Array<{
          batchId: string;
          status: BatchJobStatus;
          metadata: JobContext;
        }>
      > => {
        // Mock implementation for test harness - return empty array
        return [];
      },
    };
  }

  /**
   * Create a mock message sender
   */
  private createMockMessageSender(): MessageSender {
    return async <T = unknown, R = unknown>(
      type: string,
      payload: T,
    ): Promise<MessageResponse<R>> => {
      this.logger.debug(`Mock message sent: ${type}`, { payload });
      return {
        success: true,
        data: { mock: true, type, payload } as R,
      };
    };
  }

  /**
   * Create a mock subscribe function
   */
  private createMockSubscribe(): <T = unknown, R = unknown>(
    type: string,
    handler: MessageHandler<T, R>,
  ) => () => void {
    return <T = unknown, R = unknown>(
      type: string,
      _handler: MessageHandler<T, R>,
    ): (() => void) => {
      this.logger.debug(`Mock subscription for: ${type}`);
      // Return a mock unsubscribe function
      return () => {
        this.logger.debug(`Mock unsubscribe for: ${type}`);
      };
    };
  }

  /**
   * Clean up test environment
   */
  async cleanup(): Promise<void> {
    this.reset();
  }

  /**
   * Reset all data
   */
  private reset(): void {
    this.tools.clear();
    this.entities.clear();
    this.entityIdCounter = 0;
    this.installedPlugins = [];
    this.mockEntityRegistry.registeredTypes.clear();
  }

  /**
   * Create a mock entity service
   */
  private createMockEntityService(): EntityService {
    const mockService = {
      createEntity: async <T extends BaseEntity>(
        entity: EntityInput<T>,
      ): Promise<T> => {
        const entityType =
          ((entity as Record<string, unknown>)["entityType"] as string) ||
          "base";
        return this.createTestEntity(entityType, entity) as Promise<T>;
      },
      getEntity: async <T extends BaseEntity>(
        entityType: string,
        id: string,
      ): Promise<T | null> => {
        return this.getEntity(entityType, id);
      },
      listEntities: async <T extends BaseEntity>(
        entityType: string,
        _options?: { filter?: { metadata?: Record<string, unknown> } },
      ): Promise<T[]> => {
        // For simplicity, ignore filter options in test harness
        return this.listEntities(entityType);
      },
      updateEntity: async <T extends BaseEntity>(entity: T): Promise<T> => {
        // Find and update entity in harness storage
        const entities = this.entities.get(entity.entityType) ?? [];
        const index = entities.findIndex((e) => e.id === entity.id);
        if (index !== -1) {
          entities[index] = { ...entity, updated: new Date().toISOString() };
          this.entities.set(entity.entityType, entities);
          return entities[index] as T;
        }
        throw new Error(`Entity ${entity.id} not found for update`);
      },
      deleteEntity: async (id: string): Promise<void> => {
        // Find and remove entity from harness storage
        for (const [entityType, entities] of this.entities) {
          const index = entities.findIndex((e) => e.id === id);
          if (index !== -1) {
            entities.splice(index, 1);
            this.entities.set(entityType, entities);
            return;
          }
        }
        throw new Error(`Entity with id ${id} not found`);
      },
      search: async (): Promise<never[]> => {
        // Mock implementation - return empty array
        return [];
      },
      deriveEntity: async <T extends BaseEntity>(
        sourceEntityId: string,
        sourceEntityType: string,
        targetEntityType: string,
        _options?: { deleteSource?: boolean },
      ): Promise<T> => {
        // Mock implementation - get source entity and transform it
        const source = await this.getEntity(sourceEntityType, sourceEntityId);
        if (!source) {
          throw new Error(
            `Source entity not found: ${sourceEntityType}/${sourceEntityId}`,
          );
        }
        // Create a new entity based on the source
        const {
          id: _id,
          created: _created,
          updated: _updated,
          ...sourceFields
        } = source;
        return this.createTestEntity(
          targetEntityType,
          sourceFields as EntityInput<T>,
        ) as Promise<T>;
      },
      getEntityTypes: (): string[] => {
        // Return all registered entity types
        return Array.from(this.entities.keys());
      },
      hasEntityType: (type: string): boolean => {
        return this.entities.has(type);
      },
      createEntityAsync: async (): Promise<{
        entityId: string;
        jobId: string;
      }> => {
        throw new Error("createEntityAsync not implemented in test harness");
      },
      getAsyncJobStatus: async (): Promise<null> => {
        throw new Error("getAsyncJobStatus not implemented in test harness");
      },
      updateEntityAsync: async (): Promise<{
        entityId: string;
        jobId: string;
      }> => {
        throw new Error("updateEntityAsync not implemented in test harness");
      },
    };
    return mockService as unknown as EntityService;
  }
}
