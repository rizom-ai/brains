import type { CorePluginContext } from "../core/context";
import { createCorePluginContext } from "../core/context";
import type { Daemon, IShell, IMCPTransport } from "../interfaces";
import type { UserPermissionLevel } from "@brains/permission-service";
import type {
  CommandInfo,
  CommandResponse,
  CommandContext,
} from "@brains/command-registry";

/**
 * Context interface for interface plugins
 * Extends CorePluginContext with command management and daemon support
 */
export interface InterfacePluginContext extends CorePluginContext {
  // Command management
  listCommands: (
    interfaceType: string,
    userId: string,
  ) => Promise<CommandInfo[]>;
  executeCommand: (
    commandName: string,
    args: string[],
    context: CommandContext,
  ) => Promise<CommandResponse>;

  // Permission checking
  determineUserPermissionLevel: (
    interfaceType: string,
    userId: string,
  ) => UserPermissionLevel;

  // Daemon management
  registerDaemon: (name: string, daemon: Daemon) => void;

  // MCP transport for interface plugins
  readonly mcpTransport: IMCPTransport;
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
  const mcpTransport = shell.getMcpTransport();
  const permissionService = shell.getPermissionService();

  return {
    ...coreContext,

    // MCP transport
    mcpTransport,

    // Permission checking
    determineUserPermissionLevel: (
      interfaceType: string,
      userId: string,
    ): UserPermissionLevel => {
      return permissionService.determineUserLevel(interfaceType, userId);
    },

    // Command discovery - returns metadata only
    listCommands: async (
      interfaceType: string,
      userId: string,
    ): Promise<CommandInfo[]> => {
      const commands = commandRegistry.listCommands(interfaceType, userId);
      coreContext.logger.debug(`Retrieved ${commands.length} commands`);
      return commands;
    },

    // Command execution - find and execute by name
    executeCommand: async (
      commandName: string,
      args: string[],
      context: CommandContext,
    ): Promise<CommandResponse> => {
      const command = commandRegistry.findCommand(
        commandName,
        context.interfaceType,
        context.userId,
      );
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
  };
}
