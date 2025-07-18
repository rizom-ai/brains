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
import type { BatchJobStatus, BatchOperation, Batch } from "@brains/job-queue";
import type {
  CommandInfo,
  CommandResponse,
  CommandContext,
} from "@brains/command-registry";
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
  private commands = new Map<string, CommandInfo>();
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
      parseContent: <T = unknown>(templateName: string, content: string): T => {
        // For test harness, return mock parsed content
        try {
          return JSON.parse(content) as T;
        } catch {
          return { templateName, content, mockParsed: true } as T;
        }
      },
      registerTemplates: (): void => {
        // Mock implementation for test harness
      },
      // View template access (replaces direct viewRegistry access)
      getViewTemplate: (): undefined => undefined,

      // Route finding abstraction
      getRoute: (): undefined => undefined,
      listRoutes: () => [],

      // Template finding abstraction
      listViewTemplates: () => [],
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
      getJobStatus: async (): Promise<JobQueue | null> => {
        // Mock implementation - return completed job status
        return {
          id: "mock-job-id",
          type: "mock-job-type",
          data: "{}",
          status: "completed",
          priority: 0,
          retryCount: 0,
          maxRetries: 3,
          lastError: null,
          createdAt: Date.now(),
          scheduledFor: Date.now(),
          startedAt: Date.now(),
          completedAt: Date.now(),
          result: "mock-result",
          source: "test-harness",
          metadata: {
            interfaceId: "test",
            userId: "test-user",
            operationType: "content_generation",
          },
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

      // Get active jobs (for monitoring)
      getActiveJobs: async (_types?: string[]): Promise<JobQueue[]> => {
        // Mock implementation for test harness - return empty array
        return [];
      },

      // Get active batches (for monitoring)
      getActiveBatches: async (): Promise<Batch[]> => {
        // Mock implementation for test harness - return empty array
        return [];
      },
      // Command list for InterfacePluginContext
      listCommands: async (): Promise<CommandInfo[]> => {
        // Mock implementation - return some test commands
        return [
          { name: "help", description: "Show help", usage: "/help" },
          {
            name: "search",
            description: "Search your knowledge base",
            usage: "/search <query>",
          },
          { name: "list", description: "List entities", usage: "/list [type]" },
          {
            name: "show-entity",
            description: "Show detailed information about an entity",
            usage: "/show-entity <entity-id> [entity-type]",
          },
          {
            name: "status",
            description: "Show system status",
            usage: "/status",
          },
          {
            name: "test-progress",
            description: "Test progress tracking with a slow job",
            usage: "/test-progress",
          },
          {
            name: "test-batch",
            description: "Test batch progress tracking",
            usage: "/test-batch [count]",
          },
        ];
      },
      // Command execution for InterfacePluginContext
      executeCommand: async (
        commandName: string,
        args: string[],
        _context: CommandContext,
      ): Promise<CommandResponse> => {
        // Mock implementation - just return a simple message
        return {
          type: "message",
          message: `Mock execution of command ${commandName} with args: ${args.join(" ")}`,
        };
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
    this.commands.clear();
    this.mockEntityRegistry.registeredTypes.clear();
  }

  /**
   * Create a mock entity service
   */
  private createMockEntityService(): EntityService {
    const mockService = {
      createEntity: async <T extends BaseEntity>(
        entity: EntityInput<T>,
      ): Promise<{ entityId: string; jobId: string }> => {
        const entityType =
          ((entity as Record<string, unknown>)["entityType"] as string) ||
          "base";
        const created = await this.createTestEntity(entityType, entity);
        return { entityId: created.id, jobId: "mock-job-" + Date.now() };
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
      updateEntity: async <T extends BaseEntity>(
        entity: T,
      ): Promise<{ entityId: string; jobId: string }> => {
        // Find and update entity in harness storage
        const entities = this.entities.get(entity.entityType) ?? [];
        const index = entities.findIndex((e) => e.id === entity.id);
        if (index !== -1) {
          entities[index] = { ...entity, updated: new Date().toISOString() };
          this.entities.set(entity.entityType, entities);
          return { entityId: entity.id, jobId: "mock-job-" + Date.now() };
        }
        throw new Error(`Entity ${entity.id} not found for update`);
      },
      deleteEntity: async (
        entityType: string,
        id: string,
      ): Promise<boolean> => {
        // Find and remove entity from harness storage
        const entities = this.entities.get(entityType) ?? [];
        const index = entities.findIndex((e) => e.id === id);
        if (index !== -1) {
          entities.splice(index, 1);
          this.entities.set(entityType, entities);
          return true;
        }
        return false;
      },
      upsertEntity: async <T extends BaseEntity>(
        entity: T,
      ): Promise<{ entityId: string; jobId: string; created: boolean }> => {
        // Check if entity exists
        const existing = await this.getEntity(entity.entityType, entity.id);

        if (existing) {
          // Update existing entity
          const entities = this.entities.get(entity.entityType) ?? [];
          const index = entities.findIndex((e) => e.id === entity.id);
          if (index !== -1) {
            entities[index] = { ...entity, updated: new Date().toISOString() };
            this.entities.set(entity.entityType, entities);
          }
          return {
            entityId: entity.id,
            jobId: "mock-job-" + Date.now(),
            created: false,
          };
        } else {
          // Create new entity
          const created = await this.createTestEntity(
            entity.entityType,
            entity,
          );
          return {
            entityId: created.id,
            jobId: "mock-job-" + Date.now(),
            created: true,
          };
        }
      },
      search: async (): Promise<never[]> => {
        // Mock implementation - return empty array
        return [];
      },
      getEntityTypes: (): string[] => {
        // Return all registered entity types
        return Array.from(this.entities.keys());
      },
      hasEntityType: (type: string): boolean => {
        return this.entities.has(type);
      },
      serializeEntity: (entity: BaseEntity): string => {
        // Mock implementation - simple markdown serialization
        const adapter = this.mockEntityRegistry.registeredTypes.get(
          entity.entityType,
        );
        if (adapter) {
          return adapter.adapter.toMarkdown(entity);
        }
        // Fallback simple serialization
        return `# ${entity.id}\n\n${entity.content}`;
      },
      deserializeEntity: (
        markdown: string,
        entityType: string,
      ): Partial<BaseEntity> => {
        // Mock implementation - simple markdown deserialization
        const adapter = this.mockEntityRegistry.registeredTypes.get(entityType);
        if (adapter) {
          return adapter.adapter.fromMarkdown(markdown);
        }
        // Fallback simple deserialization
        const lines = markdown.split("\n");
        return {
          content: lines.slice(2).join("\n"),
        };
      },
      getAsyncJobStatus: async (): Promise<{
        status: "pending" | "processing" | "completed" | "failed";
        error?: string;
      } | null> => {
        // Mock implementation - always return completed
        return { status: "completed" };
      },
    };
    return mockService as unknown as EntityService;
  }
}
