import type { UserPermissionLevel } from "@brains/utils";

/**
 * Context provided to command handlers
 */
export interface CommandContext {
  userId: string;
  channelId: string;
  interfaceType: string;
  userPermissionLevel: UserPermissionLevel;
}

/**
 * Command metadata for discovery (no handler)
 */
export interface CommandInfo {
  name: string;
  description: string;
  usage?: string;
}

/**
 * Command response types matching message-interface needs
 */
export type CommandResponse =
  | { type: "message"; message: string }
  | { type: "job-operation"; message: string; jobId: string }
  | {
      type: "batch-operation";
      message: string;
      batchId: string;
      operationCount: number;
    };

/**
 * Full command interface with handler
 */
export interface Command extends CommandInfo {
  handler: (
    args: string[],
    context: CommandContext,
  ) => Promise<CommandResponse> | CommandResponse;
}

/**
 * Interface for command registry operations
 */
export interface ICommandRegistry {
  registerCommand(pluginId: string, command: Command): void;
  listCommands(): CommandInfo[];
}
