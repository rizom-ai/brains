import type { Daemon, ContentGenerationConfig } from "@brains/plugin-base";
import type {
  CommandInfo,
  Command,
  CommandResponse,
  CommandContext,
} from "@brains/command-registry";
import type { JobQueue } from "@brains/db";
import type { Batch } from "@brains/job-queue";
import type { DefaultQueryResponse } from "@brains/types";
import type { InterfacePlugin, InterfacePluginContext } from "../types";
import {
  createCorePluginContext,
  type CoreServices,
} from "./corePluginContext";

// Extended services for interface plugins
export interface InterfaceServices extends CoreServices {
  // Query processing via shell
  shell: {
    generateContent: <T = unknown>(
      config: ContentGenerationConfig,
    ) => Promise<T>;
  };
  // Command discovery and execution
  commandRegistry: {
    listCommands: () => CommandInfo[];
    findCommand: (commandName: string) => Command | undefined;
  };
  // Daemon management
  daemonRegistry: {
    register: (name: string, daemon: Daemon, pluginId: string) => void;
  };
  // Job monitoring
  jobQueueService: {
    getActiveJobs: (types?: string[]) => Promise<JobQueue[]>;
  };
  batchJobManager: {
    getActiveBatches: () => Promise<Batch[]>;
  };
}

export function createInterfacePluginContext(
  plugin: InterfacePlugin,
  services: InterfaceServices,
): InterfacePluginContext {
  // Get the core context
  const coreContext = createCorePluginContext(plugin, services);

  return {
    // Spread all core context properties
    ...coreContext,

    // Query processing
    query: async (
      prompt: string,
      context?: Record<string, unknown>,
    ): Promise<DefaultQueryResponse> => {
      // Use the knowledge-query template with appropriate context
      const queryContext = {
        ...context,
        pluginId: plugin.id,
        timestamp: new Date().toISOString(),
      };

      return services.shell.generateContent<DefaultQueryResponse>({
        prompt,
        templateName: "shell:knowledge-query",
        data: queryContext,
        interfacePermissionGrant: "trusted", // Interface plugins have trusted permissions
      });
    },

    // Command discovery - returns metadata only
    listCommands: async (): Promise<CommandInfo[]> => {
      const commands = services.commandRegistry.listCommands();
      coreContext.logger.debug(`Retrieved ${commands.length} commands`);
      return commands;
    },

    // Command execution - find and execute by name
    executeCommand: async (
      commandName: string,
      args: string[],
      context: CommandContext,
    ): Promise<CommandResponse> => {
      const command = services.commandRegistry.findCommand(commandName);
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
      const daemonName = `${plugin.id}:${name}`;
      services.daemonRegistry.register(daemonName, daemon, plugin.id);
      coreContext.logger.debug(`Registered daemon: ${daemonName}`);
    },

    // Job monitoring (read-only)
    getActiveJobs: (types?: string[]): Promise<JobQueue[]> => {
      return services.jobQueueService.getActiveJobs(types);
    },

    getActiveBatches: (): Promise<Batch[]> => {
      return services.batchJobManager.getActiveBatches();
    },
  };
}
