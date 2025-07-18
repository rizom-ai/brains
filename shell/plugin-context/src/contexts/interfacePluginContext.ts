import type { Daemon, ContentGenerationConfig } from "@brains/plugin-utils";
import type { Command } from "@brains/message-interface";
import type { JobQueue } from "@brains/db";
import type { Batch } from "@brains/job-queue";
import type { DefaultQueryResponse } from "@brains/types";
import type {
  InterfacePlugin,
  InterfacePluginContext,
  CommandInfo,
} from "../types";
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
  // Command discovery
  commandRegistry: {
    getAllCommands: () => Command[];
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
      // TODO: commandRegistry.getAllCommands() should also be renamed to listCommands()
      // and return CommandInfo[] to avoid the need for mapping here
      const commands = services.commandRegistry.getAllCommands();
      coreContext.logger.debug(`Retrieved ${commands.length} commands`);

      // Return just the metadata for discovery
      return commands.map((cmd) => {
        const info: CommandInfo = {
          name: cmd.name,
          description: cmd.description,
        };
        if (cmd.usage !== undefined) {
          info.usage = cmd.usage;
        }
        return info;
      });
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
