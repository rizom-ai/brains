import type { Command } from "@brains/message-interface";

/**
 * Interface for command registry operations
 */
export interface ICommandRegistry {
  registerCommand(pluginId: string, command: Command): void;
}
