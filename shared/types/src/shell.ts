import type { IMessageBus } from "@brains/messaging-service";
import type { IContentGenerator } from "@brains/content-generator";
import type { Logger } from "@brains/utils";
import type { IEntityService, EntityRegistry } from "@brains/entity-service";
import type { JobQueueService } from "@brains/job-queue";
import type { CommandRegistry } from "@brains/command-registry";
import type { ViewRegistry, RouteDefinition } from "@brains/view-registry";
import type { ServiceRegistry } from "@brains/service-registry";
import type { ContentGenerationConfig } from "@brains/plugin-base";
import type { Template } from "./templates";

/**
 * Shell interface that plugins use to access core services
 * This avoids circular dependencies between core and plugin-context
 */
export interface IShell {
  // Core service accessors
  getMessageBus(): IMessageBus;
  getContentGenerator(): IContentGenerator;
  getLogger(): Logger;
  getEntityService(): IEntityService;
  getEntityRegistry(): EntityRegistry;
  getJobQueueService(): JobQueueService;
  getCommandRegistry(): CommandRegistry;
  getViewRegistry(): ViewRegistry;
  getServiceRegistry(): ServiceRegistry;

  // High-level operations
  generateContent<T = unknown>(config: ContentGenerationConfig): Promise<T>;
  registerRoutes(
    routes: RouteDefinition[],
    options?: { pluginId?: string; environment?: string },
  ): void;
  registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void;

  // Plugin information
  getPluginPackageName(pluginId: string): string | undefined;
}
