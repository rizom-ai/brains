import type {
  Plugin,
  PluginContext,
  BaseEntity,
  EntityService,
  ContentGenerationService,
  Registry,
  PluginTool,
  ComponentFactory,
  MessageBus,
  RouteDefinition,
  ViewTemplate,
} from "@brains/types";
import type { EntityAdapter } from "@brains/base-entity";
import { createSilentLogger, type Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import { z } from "zod";

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
    data: Partial<T>,
  ): Promise<T> {
    const id = `${entityType}-${++this.entityIdCounter}`;
    const now = new Date().toISOString();

    const entity = {
      id,
      entityType,
      content: data.content ?? "Test content",
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
      pluginId: "test-plugin",
      registry: this.createMockRegistry(),
      logger: this.logger,
      getPlugin: (id: string): Plugin | undefined => {
        return this.installedPlugins.find((p) => p.id === id);
      },
      events: {
        on: (): unknown => undefined,
        emit: (): boolean => false,
        removeListener: (): unknown => undefined,
      } as unknown as EventEmitter,
      messageBus: {
        publish: async (): Promise<void> => undefined,
        subscribe: (): (() => void) => () => undefined,
      } as unknown as MessageBus,
      registerEntityType: <T extends BaseEntity>(
        entityType: string,
        schema: z.ZodType<T>,
        adapter: EntityAdapter<T>,
      ): void => {
        // For test harness, register the entity type in our mock registry
        this.mockEntityRegistry.registerEntityType(entityType, schema, adapter);
      },
      generateContent: async <T>(options: {
        schema: z.ZodType<T>;
        prompt: string;
        context?: {
          entities?: BaseEntity[];
          data?: Record<string, unknown>;
          examples?: T[];
          style?: string;
        };
      }): Promise<T> => {
        // For test harness, return mock data based on prompt
        if (options.prompt.includes("landing page")) {
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

        // Default response
        return {
          prompt: options.prompt,
          response: "Mock response from content generation",
          results: [],
        } as T;
      },
      contentTemplates: {
        register: (): void => {
          // Mock implementation for test harness
        },
      },
      viewRegistry: {
        registerRoute: (): void => {
          // Mock implementation for test harness
        },
        getRoute: (): undefined => undefined,
        listRoutes: (): RouteDefinition[] => {
          return [];
        },
        registerViewTemplate: (): void => {
          // Mock implementation for test harness
        },
        getViewTemplate: (): undefined => undefined,
        listViewTemplates: (): ViewTemplate[] => {
          return [];
        },
        validateViewTemplate: (): boolean => true,
        // Renderer access methods
        getRenderer: (): undefined => undefined,
        hasRenderer: (): boolean => false,
        listFormats: (): "web"[] => [],
      },
      // Direct service access
      entityService: this.getEntityService() as EntityService,
      contentRegistry: {
        registerContent: (): void => undefined,
        getTemplate: (): null => null,
        getFormatter: (): null => null,
        getSchema: (): null => null,
        generateContent: async <T>(): Promise<T> => {
          throw new Error("generateContent not implemented in test harness");
        },
        parseContent: <T>(): T => {
          throw new Error("parseContent not implemented in test harness");
        },
        formatContent: (): string => "",
        listContent: (): string[] => [],
        hasContent: (): boolean => false,
        clear: (): void => undefined,
      },
      contentGenerationService: {
        initialize: (): void => undefined,
        generate: async (): Promise<unknown> => ({}),
        generateBatch: async (): Promise<unknown[]> => [],
        registerTemplate: (): void => undefined,
        getTemplate: (): null => null,
        listTemplates: (): unknown[] => [],
        generateFromTemplate: async (): Promise<unknown> => ({}),
        generateContent: async (): Promise<unknown> => ({}),
      } as ContentGenerationService,
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
        return (
          typeof factory === "function" ? factory(...args) : factory
        ) as T;
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
        return (
          typeof factory === "function" ? factory(...args) : factory
        ) as T;
      },
    };
  }

  /**
   * Create a mock entity service
   */
  private createMockEntityService(): Partial<EntityService> {
    return {
      createEntity: async <T extends BaseEntity>(
        entity: Omit<T, "id" | "created" | "updated"> & {
          id?: string;
          created?: string;
          updated?: string;
        },
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
      ): Promise<T[]> => {
        return this.listEntities(entityType);
      },
      getEntityTypes: (): string[] => {
        return Array.from(this.entities.keys());
      },
      hasAdapter: (entityType: string): boolean => {
        // Mock implementation - assume adapter exists for known entity types
        return (
          this.entities.has(entityType) ||
          entityType === "note" ||
          entityType === "task"
        );
      },
      getAdapter: <T extends BaseEntity>(
        entityType: string,
      ): EntityAdapter<T> => {
        // Mock adapter that converts entities to markdown
        const baseSchema = z.object({
          id: z.string(),
          entityType: z.string(),
          title: z.string(),
          content: z.string(),
          tags: z.array(z.string()),
          created: z.string(),
          updated: z.string(),
        }) as unknown as z.ZodSchema<T>;

        return {
          entityType,
          schema: baseSchema,
          toMarkdown: (entity: T): string => {
            return entity.content;
          },
          fromMarkdown: (markdown: string): Partial<T> => {
            return {
              content: markdown,
            } as Partial<T>;
          },
          extractMetadata: (entity: T): Record<string, unknown> => {
            // Return any entity-specific fields beyond base fields
            const {
              id: _id,
              entityType: _entityType,
              content: _content,
              created: _created,
              updated: _updated,
              ...metadata
            } = entity as Record<string, unknown>;
            return metadata;
          },
          parseFrontMatter: <TFrontmatter>(
            _markdown: string,
            schema: z.ZodSchema<TFrontmatter>,
          ): TFrontmatter => {
            return schema.parse({});
          },
          generateFrontMatter: (_entity: T): string => {
            return "";
          },
        };
      },
      importRawEntity: async (entity: unknown): Promise<void> => {
        // Mock import - just create the entity
        const entityData = entity as Record<string, unknown>;
        await this.createTestEntity(
          (entityData["entityType"] as string | undefined) ?? "note",
          entityData,
        );
      },
    };
  }
}
