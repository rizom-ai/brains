import type { CorePluginContext } from "../core/context";
import { createCorePluginContext } from "../core/context";
import type { Daemon, IShell, DefaultQueryResponse } from "../interfaces";
import type {
  CommandInfo,
  CommandResponse,
  CommandContext,
} from "@brains/command-registry";
import type { Batch, BatchJobStatus } from "@brains/job-queue";
import type { JobQueue } from "@brains/db";

/**
 * Context interface for interface plugins
 * Extends CorePluginContext with query processing, command management, and daemon support
 */
export interface InterfacePluginContext extends CorePluginContext {
  // Query processing
  query: (
    prompt: string,
    context?: Record<string, unknown>,
  ) => Promise<DefaultQueryResponse>;

  // Command management
  listCommands: () => Promise<CommandInfo[]>;
  executeCommand: (
    commandName: string,
    args: string[],
    context: CommandContext,
  ) => Promise<CommandResponse>;

  // Daemon management
  registerDaemon: (name: string, daemon: Daemon) => void;

  // Job monitoring
  getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  getActiveBatches: () => Promise<Batch[]>;
  getBatchStatus: (batchId: string) => Promise<BatchJobStatus | null>;
}

/**
 * Create an InterfacePluginContext for a plugin
 */
export function createInterfacePluginContext(
  shell: IShell,
  pluginId: string,
): InterfacePluginContext {
  // Start with core context
  const coreContext = createCorePluginContext(shell, pluginId);

  // Get interface-specific components
  const commandRegistry = shell.getCommandRegistry();
  const jobQueueService = shell.getJobQueueService();

  return {
    ...coreContext,

    // Query processing
    query: async (
      prompt: string,
      context?: Record<string, unknown>,
    ): Promise<DefaultQueryResponse> => {
      // Use the knowledge-query template with appropriate context
      const queryContext = {
        ...context,
        pluginId,
        timestamp: new Date().toISOString(),
      };

      return shell.generateContent<DefaultQueryResponse>({
        prompt,
        templateName: "shell:knowledge-query",
        data: queryContext,
        interfacePermissionGrant: "trusted", // Interface plugins have trusted permissions
      });
    },

    // Command discovery - returns metadata only
    listCommands: async (): Promise<CommandInfo[]> => {
      const commands = commandRegistry.listCommands();
      coreContext.logger.debug(`Retrieved ${commands.length} commands`);
      return commands;
    },

    // Command execution - find and execute by name
    executeCommand: async (
      commandName: string,
      args: string[],
      context: CommandContext,
    ): Promise<CommandResponse> => {
      const command = commandRegistry.findCommand(commandName);
      if (!command) {
        throw new Error(`Command "${commandName}" not found`);
      }

      try {
        // Pass both args and context to the command handler
        const result = await command.handler(args, context);
        coreContext.logger.debug(
          `Executed command "${commandName}" with args: ${args.join(", ")}`,
          {
            userId: context.userId,
            channelId: context.channelId,
            interfaceType: context.interfaceType,
          },
        );
        return result;
      } catch (error) {
        coreContext.logger.error(`Error executing command "${commandName}"`, {
          error,
          userId: context.userId,
          channelId: context.channelId,
          interfaceType: context.interfaceType,
        });
        throw new Error(
          `Failed to execute command "${commandName}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },

    // Daemon support
    registerDaemon: (name: string, daemon: Daemon): void => {
      // Ensure daemon name is unique by prefixing with plugin ID
      const daemonName = `${pluginId}:${name}`;
      shell.registerDaemon(daemonName, daemon, pluginId);
      coreContext.logger.debug(`Registered daemon: ${daemonName}`);
    },

    // Job monitoring (read-only)
    getActiveJobs: (types?: string[]): Promise<JobQueue[]> => {
      return jobQueueService.getActiveJobs(types);
    },

    getActiveBatches: (): Promise<Batch[]> => {
      return shell.getActiveBatches();
    },

    getBatchStatus: (batchId: string): Promise<BatchJobStatus | null> => {
      return shell.getBatchStatus(batchId);
    },
  };
}
