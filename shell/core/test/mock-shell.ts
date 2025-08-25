import type {
  IShell,
  Daemon,
  DefaultQueryResponse,
  QueryContext,
  IMCPTransport,
  Command,
  PluginTool,
  PluginResource,
} from "@brains/plugins";
import type { Plugin, ContentGenerationConfig } from "@brains/plugins";
import type {
  MessageBus,
  MessageHandler,
  MessageResponse,
} from "@brains/messaging-service";
import type { ContentService } from "@brains/content-service";
import type { Logger } from "@brains/utils";
import type {
  EntityService,
  EntityRegistry,
  BaseEntity,
} from "@brains/entity-service";
import type {
  JobQueueService,
  BatchOperation,
  Batch,
  BatchJobStatus,
} from "@brains/job-queue";
import type { JobOptions, JobQueue } from "@brains/job-queue";
import type {
  CommandRegistry,
  CommandContext,
  CommandResponse,
} from "@brains/command-registry";
import type { RenderService, RouteRegistry } from "@brains/render-service";
import type { ServiceRegistry } from "@brains/service-registry";
import type { RouteDefinition } from "@brains/render-service";
import type { Template } from "@brains/templates";
import type { IConversationService } from "@brains/conversation-service";
import type { IContentProvider } from "@brains/content-service";
import { PermissionService } from "@brains/permission-service";

import { createSilentLogger } from "@brains/utils";

/**
 * Simple, consolidated MockShell implementation for testing plugins
 * All mocks are implemented inline to keep things simple
 */
export class MockShell implements IShell {
  private plugins = new Map<string, Plugin>();
  private logger: Logger;
  private templates = new Map<string, Template>();
  private routes = new Map<string, RouteDefinition>();
  private commands = new Map<string, Command>();
  private services = new Map<string, unknown>();
  private entities = new Map<string, BaseEntity>();
  private entityTypes = new Set<string>();
  private contentProviders = new Map<string, IContentProvider>();
  private messageHandlers = new Map<
    string,
    Set<MessageHandler<unknown, unknown>>
  >();

  constructor(options?: { logger?: Logger }) {
    this.logger = options?.logger ?? createSilentLogger("MockShell");

    // Pre-register BatchJobManager service that some tests expect
    this.services.set("batchJobManager", {
      enqueueBatch: async (_operations: BatchOperation[]) =>
        `batch-${Date.now()}`,
      getBatchStatus: async () => ({
        batchId: "test-batch",
        totalOperations: 0,
        completedOperations: 0,
        failedOperations: 0,
        errors: [],
        status: "completed" as const,
      }),
      getActiveBatches: async () => [],
    });

    // Pre-register DaemonRegistry service with proper tracking
    const registeredDaemons = new Set<string>();
    this.services.set("daemonRegistry", {
      register: (name: string) => {
        registeredDaemons.add(name);
      },
      unregister: (name: string) => {
        registeredDaemons.delete(name);
      },
      start: async () => {},
      stop: async () => {},
      startAll: async () => {},
      stopAll: async () => {},
      has: (name: string) => registeredDaemons.has(name),
      listDaemons: () => Array.from(registeredDaemons),
      checkHealth: async (_name: string) => ({
        healthy: false, // Daemons start as not healthy in tests
        status: "error" as const,
        message: "Daemon not started",
        lastCheck: new Date(),
      }),
    });
  }

  getMessageBus(): MessageBus {
    return {
      send: async (type: string, payload: unknown, source: string) => {
        const handlers = this.messageHandlers.get(type) ?? new Set();
        let result: MessageResponse<unknown> = { success: true };

        for (const handler of handlers) {
          const response = await handler({
            type,
            payload,
            source,
            id: `msg-${Date.now()}`,
            timestamp: new Date().toISOString(),
          });
          result = response;
          break; // Only process first handler
        }

        return result;
      },
      subscribe: (type: string, handler: MessageHandler<unknown, unknown>) => {
        if (!this.messageHandlers.has(type)) {
          this.messageHandlers.set(type, new Set());
        }
        const handlers = this.messageHandlers.get(type);
        if (handlers) {
          handlers.add(handler);
        }

        return () => {
          this.messageHandlers.get(type)?.delete(handler);
        };
      },
      unsubscribe: () => {},
      getSubscriptions: () => Array.from(this.messageHandlers.keys()),
    } as unknown as MessageBus;
  }

  getContentService(): ContentService {
    return {
      generateContent: async <T = unknown>(
        templateName: string,
        context?: Record<string, unknown>,
      ) => {
        // Simple mock generation - just return the context with a message
        return {
          message: `Generated content for ${templateName}`,
          summary: "Test summary",
          topics: [],
          sources: [],
          ...context,
        } as T;
      },
      formatContent: <T = unknown>(_templateName: string, data: T) => {
        return `Formatted: ${JSON.stringify(data)}`;
      },
      parseContent: <T = unknown>(
        _templateName: string,
        content: string,
      ): T => {
        return { parsed: content } as T;
      },
      hasTemplate: (name: string) => this.templates.has(name),
      getTemplate: (name: string) => this.templates.get(name) ?? null,
      listTemplates: () => Array.from(this.templates.values()),
      generateWithRoute: async () => "Generated route content",
      unregisterTemplate: (name: string) => {
        this.templates.delete(name);
      },
      registerProvider: (provider: IContentProvider) => {
        this.contentProviders.set(provider.id, provider);
      },
      getProvider: (id: string) => this.contentProviders.get(id),
      listProviders: () => Array.from(this.contentProviders.values()),
    } as unknown as ContentService;
  }

  getLogger(): Logger {
    return this.logger;
  }

  getEntityService(): EntityService {
    return {
      createEntity: async (entity: BaseEntity) => {
        const id = entity.id || `entity-${Date.now()}`;
        this.entities.set(id, { ...entity, id });
        return { entityId: id, jobId: `job-${id}` };
      },
      updateEntity: async (entity: BaseEntity) => {
        if (!entity.id) throw new Error("Entity must have an id");
        this.entities.set(entity.id, entity);
        return { entityId: entity.id, jobId: `job-${entity.id}` };
      },
      deleteEntity: async (_type: string, id: string) => {
        this.entities.delete(id);
        return true;
      },
      getEntity: async (_type: string, id: string) => {
        const entity = this.entities.get(id);
        return entity?.entityType === _type ? entity : null;
      },
      listEntities: async (type: string) => {
        return Array.from(this.entities.values()).filter(
          (e) => e.entityType === type,
        );
      },
      search: async () => [],
      getEntityTypes: () => Array.from(this.entityTypes),
      hasEntityType: (type: string) => this.entityTypes.has(type),
      serializeEntity: (entity: BaseEntity) => JSON.stringify(entity),
      deserializeEntity: (markdown: string) =>
        ({ content: markdown }) as BaseEntity,
      getAsyncJobStatus: async () => ({ status: "completed" as const }),
      upsertEntity: async (entity: BaseEntity) => {
        const exists = entity.id && this.entities.has(entity.id);
        const result = exists
          ? await this.getEntityService().updateEntity(entity)
          : await this.getEntityService().createEntity(entity);
        return { ...result, created: !exists };
      },
    } as unknown as EntityService;
  }

  getEntityRegistry(): EntityRegistry {
    return {
      registerEntityType: (
        type: string,
        _schema: unknown,
        _adapter: unknown,
      ) => {
        this.entityTypes.add(type);
      },
      getSchema: () => {
        throw new Error("Not implemented");
      },
      getAdapter: () => {
        throw new Error("Not implemented");
      },
      hasEntityType: (type: string) => this.entityTypes.has(type),
      validateEntity: (_type: string, entity: BaseEntity) => entity,
      getAllEntityTypes: () => Array.from(this.entityTypes),
    } as unknown as EntityRegistry;
  }

  getConversationService(): IConversationService {
    return {
      startConversation: async () => `conv-${Date.now()}`,
      addMessage: async () => {},
      getConversation: async () => null,
      searchConversations: async () => [],
      getMessages: async () => [],
    };
  }

  getJobQueueService(): JobQueueService {
    return {
      enqueue: async () => `job-${Date.now()}`,
      dequeue: async () => null,
      complete: async () => {},
      fail: async () => {},
      getStatus: async () => null,
      getStats: async () => ({
        pending: 0,
        processing: 0,
        failed: 0,
        completed: 0,
        total: 0,
      }),
      cleanup: async () => 0,
      registerHandler: () => {},
      unregisterHandler: () => {},
      unregisterPluginHandlers: () => {},
      getRegisteredTypes: () => [],
      getHandler: () => undefined,
      update: async () => {},
      getActiveJobs: async () => [],
      getStatusByEntityId: async () => null,
    } as unknown as JobQueueService;
  }

  getCommandRegistry(): CommandRegistry {
    return {
      registerCommand: (pluginId: string, command: Command) => {
        const name = `${pluginId}:${command.name}`;
        this.commands.set(name, { ...command, pluginId } as Command);
      },
      unregisterCommand: (pluginId: string, name: string) => {
        this.commands.delete(`${pluginId}:${name}`);
      },
      unregisterAllCommands: (pluginId: string) => {
        for (const key of this.commands.keys()) {
          if (key.startsWith(`${pluginId}:`)) {
            this.commands.delete(key);
          }
        }
      },
      getCommand: (name: string) => this.commands.get(name),
      findCommand: (name: string) => {
        // Match the real CommandRegistry behavior - search by command name
        for (const [, cmd] of this.commands) {
          if (cmd.name === name) {
            return cmd;
          }
        }
        return undefined;
      },
      listCommands: () => Array.from(this.commands.values()),
      executeCommand: async (
        name: string,
        args: string[],
        context: CommandContext,
      ): Promise<CommandResponse> => {
        const command =
          this.commands.get(name) ?? this.commands.get(`shell:${name}`);
        if (!command) {
          return { type: "message", message: `Command not found: ${name}` };
        }

        if ("execute" in command && typeof command.execute === "function") {
          return await command.execute(args, context);
        }

        return { type: "message", message: `Executed: ${name}` };
      },
    } as unknown as CommandRegistry;
  }

  getRenderService(): RenderService {
    return {
      get: () => undefined,
      list: () => [],
      validate: () => true,
      findViewTemplate: () => undefined,
      getRenderer: () => undefined,
      hasRenderer: () => false,
      listFormats: () => [],
    } as unknown as RenderService;
  }

  getRouteRegistry(): RouteRegistry {
    return {
      register: (route: RouteDefinition) => {
        this.routes.set(route.path, route);
      },
      unregister: (path: string) => {
        this.routes.delete(path);
      },
      get: (path: string) => this.routes.get(path),
      list: () => Array.from(this.routes.values()),
      listByPlugin: () => [],
    } as unknown as RouteRegistry;
  }

  getServiceRegistry(): ServiceRegistry {
    return {
      register: (name: string, factory: () => unknown) => {
        this.services.set(name, factory());
      },
      resolve: (name: string) => {
        const service = this.services.get(name);
        if (!service) throw new Error(`Service not found: ${name}`);
        return service;
      },
      has: (name: string) => this.services.has(name),
      list: () => Array.from(this.services.keys()),
      clear: () => this.services.clear(),
    } as unknown as ServiceRegistry;
  }

  getMcpTransport(): IMCPTransport {
    // Return a mock MCP transport for testing
    return {
      getMcpServer: () => {
        throw new Error("Mock MCP server not implemented");
      },
      setPermissionLevel: () => {
        // No-op for testing
      },
    };
  }

  getPermissionService(): PermissionService {
    // Return a mock PermissionService for testing
    return new PermissionService({});
  }

  async generateContent<T = unknown>(
    config: ContentGenerationConfig,
  ): Promise<T> {
    const scopedName = config.templateName;
    const contentGen = this.getContentService();
    return contentGen.generateContent<T>(scopedName, {
      prompt: config.prompt,
      conversationId: config.conversationId,
      data: config.data,
    });
  }

  async query(
    prompt: string,
    context?: QueryContext,
  ): Promise<DefaultQueryResponse> {
    // Mock query implementation - uses generateContent under the hood
    return this.generateContent<DefaultQueryResponse>({
      prompt,
      templateName: "shell:knowledge-query",
      conversationId: context?.conversationId || "default",
      ...(context && { data: context }),
      interfacePermissionGrant: "public",
    });
  }

  async getActiveJobs(_types?: string[]): Promise<JobQueue[]> {
    // Mock implementation - return empty array
    return [];
  }

  async getJobStatus(_jobId: string): Promise<JobQueue | null> {
    // Mock implementation - return null
    return null;
  }

  registerRoutes(
    routes: RouteDefinition[],
    options?: { pluginId?: string },
  ): void {
    const routeReg = this.getRouteRegistry();
    routes.forEach((route) => {
      routeReg.register({
        ...route,
        pluginId: options?.pluginId,
      });
    });
  }

  registerTemplate(name: string, template: Template, pluginId?: string): void {
    const scopedName = pluginId ? `${pluginId}:${name}` : `shell:${name}`;
    this.templates.set(scopedName, template);
  }

  registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void {
    Object.entries(templates).forEach(([name, template]) => {
      this.registerTemplate(name, template, pluginId);
    });
  }

  getPluginPackageName(pluginId: string): string | undefined {
    return this.plugins.get(pluginId)?.packageName;
  }

  // Plugin capability registration methods
  registerPluginCommands(pluginId: string, commands: Command[]): void {
    this.logger.debug(
      `Mock: Registered ${commands.length} commands for ${pluginId}`,
    );
  }

  registerPluginTools(pluginId: string, tools: PluginTool[]): void {
    this.logger.debug(`Mock: Registered ${tools.length} tools for ${pluginId}`);
  }

  registerPluginResources(pluginId: string, resources: PluginResource[]): void {
    this.logger.debug(
      `Mock: Registered ${resources.length} resources for ${pluginId}`,
    );
  }

  // Additional methods for testing
  registerPlugin(plugin: Plugin): void {
    this.plugins.set(plugin.id, plugin);
  }

  addPlugin(plugin: Plugin): void {
    this.registerPlugin(plugin);
  }

  getPlugin(pluginId: string): Plugin | undefined {
    return this.plugins.get(pluginId);
  }

  getTemplates(): Map<string, Template> {
    return new Map(this.templates);
  }

  getContentProviders(): Map<string, IContentProvider> {
    return new Map(this.contentProviders);
  }

  // Batch job operations - simple mock implementations
  async enqueueBatch(
    operations: BatchOperation[],
    _options: JobOptions,
    pluginId: string,
  ): Promise<string> {
    // Return a mock batch ID for testing
    this.logger.debug(
      `Mock: Enqueued batch with ${operations.length} operations for plugin ${pluginId}`,
    );
    return `batch-${Date.now()}`;
  }

  async getActiveBatches(): Promise<Batch[]> {
    // Return empty array for testing
    return [];
  }

  async getBatchStatus(batchId: string): Promise<BatchJobStatus | null> {
    // Return a mock batch status for testing
    return {
      batchId,
      totalOperations: 0,
      completedOperations: 0,
      failedOperations: 0,
      errors: [],
      status: "completed" as const,
    };
  }

  // Daemon registration - simple mock that just logs
  registerDaemon(name: string, daemon: Daemon, pluginId: string): void {
    this.logger.debug(`Mock: Registered daemon ${name} for plugin ${pluginId}`);
    // Store in services map for test verification if needed
    this.services.set(`daemon:${name}`, daemon);
  }

  // Create a fresh instance
  static createFresh(options?: { logger?: Logger }): MockShell {
    return new MockShell(options);
  }
}

/**
 * Create a mock Shell instance
 */
export function createMockShell(options?: { logger?: Logger }): MockShell {
  return new MockShell(options);
}
