import { BasePlugin } from "@brains/plugins";
import type { PluginCapabilities } from "@brains/plugins";
import type { IShell } from "@brains/types";
import type { ServicePluginContext } from "./context";
import { createServicePluginContext } from "./context";
import type { ContentGenerationConfig } from "@brains/plugins";
import type { IEntityService, BaseEntity, EntityAdapter } from "@brains/entity-service";
import type { z } from "zod";

/**
 * Base class for service plugins
 * Service plugins extend core functionality with entity management, job queuing, and AI generation
 */
export abstract class ServicePlugin<TConfig = unknown> extends BasePlugin<
  TConfig,
  ServicePluginContext
> {
  public readonly type = "service" as const;

  /**
   * Register the plugin with shell - creates ServicePluginContext internally
   */
  override async register(shell: IShell): Promise<PluginCapabilities> {
    // Create typed context from shell
    const context = createServicePluginContext(shell, this.id);
    this.context = context;

    // Set up message handlers
    this.setupMessageHandlers(context);

    // Call lifecycle hook with typed context
    await this.onRegister(context);

    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
      commands: await this.getCommands(),
    };
  }

  /**
   * Get the entity service for direct access
   */
  protected get entityService(): IEntityService {
    const context = this.getContext();
    return context.entityService;
  }

  /**
   * Helper method to generate content using AI
   */
  protected async generateContent<T = unknown>(
    config: ContentGenerationConfig,
  ): Promise<T> {
    const context = this.getContext();
    return context.generateContent<T>(config);
  }

  /**
   * Helper method to register an entity type
   */
  protected registerEntityType<T extends BaseEntity>(
    entityType: string,
    schema: z.ZodSchema<T>,
    adapter: EntityAdapter<T>,
  ): void {
    const context = this.getContext();
    context.registerEntityType(entityType, schema, adapter);
  }

  /**
   * Helper method to enqueue a job
   */
  protected async enqueueJob(
    type: string,
    data: unknown,
    options: Parameters<ServicePluginContext["enqueueJob"]>[2],
  ): Promise<string> {
    const context = this.getContext();
    return context.enqueueJob(type, data, options);
  }

  /**
   * Helper method to enqueue a batch of operations
   */
  protected async enqueueBatch(
    operations: Parameters<ServicePluginContext["enqueueBatch"]>[0],
    options: Parameters<ServicePluginContext["enqueueBatch"]>[1],
  ): Promise<string> {
    const context = this.getContext();
    return context.enqueueBatch(operations, options);
  }

  /**
   * Override to register entity types during initialization
   */
  protected async registerEntityTypes(
    _context: ServicePluginContext,
  ): Promise<void> {
    // Default implementation does nothing
    // Override in subclasses to register entity types
  }

  /**
   * Override to register job handlers during initialization
   */
  protected async registerJobHandlers(
    _context: ServicePluginContext,
  ): Promise<void> {
    // Default implementation does nothing
    // Override in subclasses to register job handlers
  }

  /**
   * Override to register routes during initialization
   */
  protected async registerRoutes(
    _context: ServicePluginContext,
  ): Promise<void> {
    // Default implementation does nothing
    // Override in subclasses to register routes
  }

  /**
   * Override onRegister to add service-specific initialization
   */
  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    // Register entity types first
    await this.registerEntityTypes(context);

    // Register job handlers
    await this.registerJobHandlers(context);

    // Register routes
    await this.registerRoutes(context);
  }
}
