import type { Logger } from "@brains/utils";
import type { IMessageBus } from "@brains/messaging-service";
import type { IContentGenerator } from "@brains/content-generator";
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

    // Content generation capabilities
    generateContent: async (config) => {
      return services.contentGenerator.generateContent(
        config.templateName,
        config.data,
        plugin.id,
      );
    },

    formatContent: (templateName, data, options) => {
      return services.contentGenerator.formatContent(templateName, data, {
        ...options,
        pluginId: plugin.id,
      });
    },

    parseContent: (templateName, content) => {
      return services.contentGenerator.parseContent(
        templateName,
        content,
        plugin.id,
      );
    },

    registerTemplates: (templates) => {
      Object.entries(templates).forEach(([name, template]) => {
        services.contentGenerator.registerTemplate(name, template);
        scopedLogger.debug(`Registered template: ${name}`);
      });
    },
  };
}
