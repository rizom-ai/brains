import type { Logger } from "@brains/utils";
import type { PluginTool } from "@brains/plugin-utils";
import type { MessageSender, MessageHandler } from "@brains/messaging-service";

// Command interface - core concept for all plugins
export interface Command {
  name: string;
  description: string;
  usage?: string;
  handler: (args: string[]) => Promise<string> | string;
}

// Core Plugin types
export interface CorePlugin {
  id: string;
  version: string;
  type: "core";
  description?: string;
  register(context: CorePluginContext): Promise<void>;
}

// Core Plugin Context - minimal interface for core plugins
export interface CorePluginContext {
  // Identity
  readonly pluginId: string;
  readonly logger: Logger;

  // Command registration
  registerCommand(command: Command): void;

  // Tool registration (for MCP) - uses existing PluginTool interface
  registerTool(tool: PluginTool): void;

  // Inter-plugin messaging - uses existing types from messaging-service
  sendMessage: MessageSender;
  subscribe: (channel: string, handler: MessageHandler) => () => void;
}