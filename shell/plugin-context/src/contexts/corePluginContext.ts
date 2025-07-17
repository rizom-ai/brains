import type { Logger } from "@brains/utils";
import type { PluginTool } from "@brains/plugin-utils";
import type { MessageSender, MessageHandler } from "@brains/messaging-service";
import type { CorePlugin, CorePluginContext, Command } from "../types";

// Minimal service interfaces for what CorePluginContext needs
export interface CoreServices {
  logger: Logger;
  commandRegistry: {
    register(pluginId: string, command: Command): void;
  };
  toolRegistry: {
    register(pluginId: string, tool: PluginTool): void;
  };
  messageBus: {
    send: MessageSender;
    subscribe: (channel: string, handler: MessageHandler) => () => void;
  };
}

export function createCorePluginContext(
  plugin: CorePlugin,
  services: CoreServices,
): CorePluginContext {
  const scopedLogger = services.logger.child(plugin.id);

  return {
    pluginId: plugin.id,
    logger: scopedLogger,

    registerCommand: (command: Command) => {
      services.commandRegistry.register(plugin.id, command);
      scopedLogger.debug(`Registered command: ${command.name}`);
    },

    registerTool: (tool: PluginTool) => {
      services.toolRegistry.register(plugin.id, tool);
      scopedLogger.debug(`Registered tool: ${tool.name}`);
    },

    sendMessage: services.messageBus.send,
    subscribe: services.messageBus.subscribe,
  };
}