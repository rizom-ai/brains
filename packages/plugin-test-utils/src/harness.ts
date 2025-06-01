import type {
  Plugin,
  PluginContext,
  BaseEntity,
  EntityService,
  Registry,
  PluginTool,
  ComponentFactory,
  MessageBus,
} from "@brains/types";
import { createSilentLogger, type Logger } from "@brains/utils";
import type { EventEmitter } from "events";

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

  constructor(options: PluginTestHarnessOptions = {}) {
    this.logger = options.logger ?? createSilentLogger("test-harness");
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
    data: Partial<T>,
  ): Promise<T> {
    const id = `${entityType}-${++this.entityIdCounter}`;
    const now = new Date().toISOString();
    
    const entity = {
      id,
      entityType,
      title: data.title ?? "Test Entity",
      content: data.content ?? "Test content",
      tags: data.tags ?? [],
      created: data.created ?? now,
      updated: data.updated ?? now,
      ...data,
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
    return (entities.find(e => e.id === id) as T | undefined) ?? null;
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
    // Simple implementation - just search by title
    const allEntities = Array.from(this.entities.values()).flat();
    const matches = allEntities.filter(e => 
      e.title.toLowerCase().includes(query.toLowerCase()) ||
      e.content.toLowerCase().includes(query.toLowerCase())
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
   * Get entity service
   */
  getEntityService(): Partial<EntityService> {
    return this.createMockEntityService();
  }

  /**
   * Get registry
   */
  getRegistry(): Registry {
    return this.createMockRegistry();
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
      registry: this.createMockRegistry(),
      logger: this.logger,
      getPlugin: (id: string): Plugin | undefined => {
        return this.installedPlugins.find(p => p.id === id);
      },
      events: {
        on: (): unknown => undefined,
        emit: (): boolean => false,
        removeListener: (): unknown => undefined,
      } as unknown as EventEmitter,
      messageBus: {
        publish: async (): Promise<void> => undefined,
        subscribe: (): () => void => () => undefined,
      } as unknown as MessageBus,
      formatters: {
        register: (): void => undefined,
      },
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
  }

  /**
   * Create a mock registry for the plugin context
   */
  private createMockRegistry(): Registry {
    const registry = new Map<string, unknown>();
    
    // Pre-register the entity service
    registry.set("entityService", this.createMockEntityService());
    
    return {
      register: <T>(id: string, factory: ComponentFactory<T>): void => {
        registry.set(id, factory);
      },
      resolve: <T>(id: string, ...args: unknown[]): T => {
        if (id === "entityService") {
          return this.createMockEntityService() as T;
        }
        const factory = registry.get(id);
        if (!factory) {
          throw new Error(`Component ${id} not found in registry`);
        }
        return (typeof factory === "function" ? factory(...args) : factory) as T;
      },
      has: (id: string): boolean => {
        return registry.has(id);
      },
      getAll: (): string[] => {
        return Array.from(registry.keys());
      },
      clear: (): void => {
        registry.clear();
      },
      unregister: (id: string): void => {
        registry.delete(id);
      },
      createFresh: <T>(id: string, ...args: unknown[]): T => {
        const factory = registry.get(id);
        if (!factory) {
          throw new Error(`Component ${id} not found in registry`);
        }
        return (typeof factory === "function" ? factory(...args) : factory) as T;
      },
    };
  }

  /**
   * Create a mock entity service
   */
  private createMockEntityService(): Partial<EntityService> {
    return {
      createEntity: async <T extends BaseEntity>(entity: Omit<T, "id"> & { id?: string }): Promise<T> => {
        const entityType = ((entity as Record<string, unknown>)["entityType"] as string) || "base";
        return this.createTestEntity(entityType, entity) as Promise<T>;
      },
      getEntity: async <T extends BaseEntity>(entityType: string, id: string): Promise<T | null> => {
        return this.getEntity(entityType, id);
      },
      listEntities: async <T extends BaseEntity>(entityType: string): Promise<T[]> => {
        return this.listEntities(entityType);
      },
      getEntityTypes: (): string[] => {
        return Array.from(this.entities.keys());
      },
    };
  }
}