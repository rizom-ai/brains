import type { Logger } from "@brains/utils";
import type { IMessageBus } from "@brains/messaging-service";
import type { IContentGenerator } from "@brains/content-generator";
import type { Template } from "@brains/types";
import type { BasePlugin, CorePluginContext } from "../types";

// Services that Shell provides to build the plugin context
export interface CoreServices {
  logger: Logger;
  messageBus: IMessageBus;
  contentGenerator: IContentGenerator;
}

export function createCorePluginContext(
  plugin: BasePlugin,
  services: CoreServices,
): CorePluginContext {
  const scopedLogger = services.logger.child(plugin.id);

  return {
    pluginId: plugin.id,
    logger: scopedLogger,

    sendMessage: (type, payload) =>
      services.messageBus.send(type, payload, plugin.id),
    subscribe: services.messageBus.subscribe,

    // Template operations (lightweight, no AI generation)
    formatContent: <T = unknown>(
      templateName: string,
      data: T,
      options?: { truncate?: number },
    ): string => {
      return services.contentGenerator.formatContent(templateName, data, {
        ...options,
        pluginId: plugin.id,
      });
    },

    parseContent: <T = unknown>(templateName: string, content: string): T => {
      return services.contentGenerator.parseContent(
        templateName,
        content,
        plugin.id,
      );
    },

    registerTemplates: (templates: Record<string, Template>): void => {
      Object.entries(templates).forEach(([name, template]) => {
        services.contentGenerator.registerTemplate(name, template);
        scopedLogger.debug(`Registered template: ${name}`);
      });
    },
  };
}
