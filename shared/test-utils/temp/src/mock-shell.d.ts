import type { IShell, Template } from "@brains/types";
import type { Logger } from "@brains/utils";
import type { IMessageBus } from "@brains/messaging-service";
import type { IContentGenerator } from "@brains/content-generator";
import type { IEntityService, EntityRegistry } from "@brains/entity-service";
import type { JobQueueService } from "@brains/job-queue";
import type { CommandRegistry } from "@brains/command-registry";
import type { ViewRegistry, RouteDefinition } from "@brains/view-registry";
import { ServiceRegistry } from "@brains/service-registry";
import type { Plugin, ContentGenerationConfig } from "@brains/plugin-base";
/**
 * Mock Shell implementation for testing plugins
 */
export declare class MockShell implements IShell {
  private messageBus;
  private contentGenerator;
  private logger;
  private entityService;
  private entityRegistry;
  private jobQueueService;
  private commandRegistry;
  private viewRegistry;
  private serviceRegistry;
  private plugins;
  private templates;
  constructor(options: {
    messageBus?: IMessageBus;
    contentGenerator?: IContentGenerator;
    logger: Logger;
    entityService?: IEntityService;
    entityRegistry?: EntityRegistry;
    jobQueueService?: JobQueueService;
    commandRegistry?: CommandRegistry;
    viewRegistry?: ViewRegistry;
    serviceRegistry?: ServiceRegistry;
  });
  private createMockMessageBus;
  private createMockContentGenerator;
  private createMockEntityService;
  private createMockServiceRegistry;
  getMessageBus(): IMessageBus;
  getContentGenerator(): IContentGenerator;
  getLogger(): Logger;
  getEntityService(): IEntityService;
  getEntityRegistry(): EntityRegistry;
  getJobQueueService(): JobQueueService;
  getCommandRegistry(): CommandRegistry;
  getViewRegistry(): ViewRegistry;
  getServiceRegistry(): ServiceRegistry;
  generateContent<T = unknown>(config: ContentGenerationConfig): Promise<T>;
  registerRoutes(
    _routes: RouteDefinition[],
    _options?: {
      pluginId?: string;
      environment?: string;
    },
  ): void;
  registerTemplates(
    templates: Record<string, Template>,
    pluginId?: string,
  ): void;
  getPlugin(id: string): Plugin | undefined;
  getPluginPackageName(pluginId: string): string | undefined;
  addPlugin(plugin: Plugin): void;
  getTemplates(): Map<string, Template>;
}
